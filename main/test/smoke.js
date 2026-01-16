import http from 'k6/http';
import { check, sleep } from 'k6';
import {BASE_URL} from "../setup/config.js";
import {loadAccountSetup} from "../setup/loadAccountSetup.js";
import {loginSetup} from "../setup/loginSetup.js";

export const options = {
    scenarios: {
        perf_smoke: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "30s", target: 5 },   // warm-up
                { duration: "2m", target: 15 },   // main smoke
                { duration: "30s", target: 50 },  // mini spike
                { duration: "30s", target: 5 },   // recover
                { duration: "30s", target: 0 },   // cool-down
            ],
            gracefulStop: "10s",
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.01"],
        http_req_duration: ["p(95)<800"],
    },
};

// 1. 본인 회원정보 조회
const getMyInfo = `${BASE_URL}/rest-api/v1/member`;
// 2. 루프 리포트 조회
const getLoopReport = `${BASE_URL}/rest-api/v1/report`;
// 3. 루프 상세 조회 (유저별 loopId 동적)
const getDetailLoopUrl = (loopId) => `${BASE_URL}/rest-api/v1/loops/${loopId}`;
// 4. 날짜별 루프 리스트 조회
const getDailyLoopsUrl = () => `${BASE_URL}/rest-api/v1/loops/date/${formatToday()}`;
// 5. 루프 캘린더 조회
const getLoopCalendar = `${BASE_URL}/rest-api/v1/loops/calendar?year=2026&month=1`;
// // 6. 내 팀 리스트 조회
// const getMyTeams = `${BASE_URL}/rest-api/v1/teams/my`;
// // 7. 팀 상세 조회 (유저별 teamId 동적)
// const getTeamDetailUrl = (teamId) => `${BASE_URL}/rest-api/v1/teams/${teamId}`;
// // 8. 팀 루프 리스트 조회 (유저별 teamId 동적)
// const getTeamLoopsUrl = (teamId) => `${BASE_URL}/rest-api/v1/teams/${teamId}/loops`;
// // 9. 팀 루프 상세 조회 (내 루프) (유저별 teamId/teamLoopId 동적)
// const getTeamLoopMyDetailUrl = (teamId, teamLoopId) => `${BASE_URL}/rest-api/v1/teams/${teamId}/loops/${teamLoopId}/my`;
// // 10. 팀 루프 상세 조회 (팀 루프) (유저별 teamId/teamLoopId 동적)
// const getTeamLoopDetailUrl = (teamId, teamLoopId) => `${BASE_URL}/rest-api/v1/teams/${teamId}/loops/${teamLoopId}/all`;
// // 11. 팀 루프 캘린더 조회 (유저별 teamId 동적)
// const getTeamLoopCalendarUrl = (teamId) => `${BASE_URL}/rest-api/v1/teams/${teamId}/loops/calendar?year=2026&month=1`;

// -------------------- setup() --------------------
export function setup() {
    const emails = loadAccountSetup();
    const MAX_SESSIONS = 50;
    const targetEmails = emails.slice(0, MAX_SESSIONS);
    const sessions = loginSetup(targetEmails);

    if (!sessions.length) {
        throw new Error("No sessions created in setup()");
    }
    return { sessions };
}

// -------------------- helpers --------------------
function formatToday() {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function pickSession(data) {
    // VU 별로 안정적으로 하나 고르기: (__VU-1) 기준
    const sessions = data.sessions;
    const idx = (__VU - 1) % sessions.length;
    return sessions[idx];
}

function authParams(session) {
    return {
        cookies: session.cookies,
        headers: {
            "Content-Type": "application/json",
            // 추가 헤더 필요하면 여기
        },
        tags: {
            userKey: session.userKey, // grafana에서 유저별로 보고싶으면 태그 활용 가능
        },
    };
}

function get(url, session, name) {
    const res = http.get(url, authParams(session));
    check(res, {
        [`${name} status 200`]: (r) => r.status === 200,
    });
    return res;
}

function parseUserNo(session) {
    const key = String(session.userKey ?? "");
    const m = key.match(/user(\d+)\@/i) || key.match(/user(\d+)/i);
    if (m) return parseInt(m[1], 10);
}

// 유저당 루프 19개: user1 -> 1, user2 -> 20, user3 -> 39 ...
function firstLoopIdForUser(userNo) {
    return 1 + (userNo - 1) * 19;
}

// 10명 = 1팀: 1~10 -> 1, 11~20 -> 2 ...
function teamIdForUser(userNo) {
    return Math.floor((userNo - 1) / 10) + 1;
}

// 팀당 teamLoop 8개: team=1 -> 1, team=2 -> 9, team=3 -> 17 ...
function firstTeamLoopIdForTeam(teamId) {
    return 1 + (teamId - 1) * 8;
}

// 응답에서 첫 teamLoopId를 최대한 유연하게 뽑아보기
function extractFirstTeamLoopId(teamLoopsRes) {
    const candidatePaths = [
        // 흔한 케이스들 최대한 커버
        "data[0].id",
        "data[0].teamLoopId",
        "data[0].loopId",
        "data.content[0].id",
        "data.content[0].teamLoopId",
        "data.content[0].loopId",
        "data.items[0].id",
        "data.items[0].teamLoopId",
    ];
    for (const path of candidatePaths) {
        const v = teamLoopsRes.json(path);
        if (typeof v === "number" && v > 0) return v;
    }
    // 혹시 문자열 숫자면
    for (const path of candidatePaths) {
        const v = teamLoopsRes.json(path);
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n > 0) return n;
    }
    return null;
}

// -------------------- VU flow --------------------
export default function (data) {
    const session = pickSession(data);
    const userNo = parseUserNo(session);
    // 유저별 루프 상세 id: 1, 20, 39 ...
    const loopId = firstLoopIdForUser(userNo);
    // 유저별 팀 id: 1~10 -> 1, 11~20 -> 2 ...
    const teamId = teamIdForUser(userNo);
    // 팀별 teamLoopId 시작값(팀당 8개)
    const teamLoopId = firstTeamLoopIdForTeam(teamId);

    get(getMyInfo, session, "getMyInfo");
    sleep(1);

    get(getLoopCalendar, session, "getLoopCalendar");
    sleep(1);

    get(getDailyLoopsUrl(), session, "getDailyLoops");
    sleep(1);

    // ---- 루프 상세 조회: 유저별 loopId 적용 ----
    get(getDetailLoopUrl(loopId), session, `getDetailLoop(loopId=${loopId})`);
    sleep(1);

    get(getLoopReport, session, "getLoopReport");
    sleep(1);

    // get(getMyTeams, session, "getMyTeams");
    // sleep(1);
    //
    // // ---- 팀 상세 조회: 유저별 teamId 적용 ----
    // get(getTeamDetailUrl(teamId), session, `getTeamDetail(teamId=${teamId})`);
    // sleep(1);
    //
    // // ---- 팀 루프 리스트 조회: 유저별 teamId 적용 ----
    // const teamLoopsRes = get(getTeamLoopsUrl(teamId), session, `getTeamLoops(teamId=${teamId})`);
    // sleep(1);
    //
    // // ---- 팀 루프 상세(내/팀): 유저별 teamId/teamLoopId 적용 ----
    // get(
    //     getTeamLoopMyDetailUrl(teamId, teamLoopId),
    //     session,
    //     `getTeamLoopMyDetail(teamId=${teamId}, teamLoopId=${teamLoopId})`
    // );
    // sleep(1);
    //
    // get(
    //     getTeamLoopDetailUrl(teamId, teamLoopId),
    //     session,
    //     `getTeamLoopDetail(teamId=${teamId}, teamLoopId=${teamLoopId})`
    // );
    // sleep(1);
    //
    // // ---- 팀 루프 캘린더: 유저별 teamId 적용 ----
    // get(getTeamLoopCalendarUrl(teamId), session, `getTeamLoopCalendar(teamId=${teamId})`);
    // sleep(1);
}
