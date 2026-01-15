import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL } from "../setup/config.js";
import { loginSetup } from "../setup/loginSetup.js";
import { loadAccountSetup } from "../setup/loadAccountSetup.js";

export const options = {
    scenarios: {
        perf_stress_breakpoint: {
            executor: "ramping-vus",
            startVUs: 0,
            stages: [
                { duration: "2m", target: 200 },
                { duration: "1m", target: 200 }, // hold
                { duration: "2m", target: 400 },
                { duration: "1m", target: 400 }, // hold
                { duration: "2m", target: 600 },
                { duration: "1m", target: 600 }, // hold
                { duration: "2m", target: 800 },
                { duration: "1m", target: 800 }, // hold
                { duration: "2m", target: 1000 },
                { duration: "5m", target: 1000 }, // 여기서 깨지는지/누적되는지 확인
                { duration: "2m", target: 0 },  // 쿨다운
            ],
            gracefulRampDown: "30s",
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.01"],
        http_req_duration: ["p(95)<1000", "p(99)<2000"],
    },
    setupTimeout: "300s",
};

// -------------------- endpoints (smoke.js 그대로) --------------------
// 본인 회원정보 조회
const getMyInfo = `${BASE_URL}/rest-api/v1/member`;
// 루프 리포트 조회
const getLoopReport = `${BASE_URL}/rest-api/v1/report`;
// 루프 상세 조회 (유저별 loopId 동적)
const getDetailLoopUrl = (loopId) => `${BASE_URL}/rest-api/v1/loops/${loopId}`;
// 날짜별 루프 리스트 조회
const getDailyLoopsUrl = () => `${BASE_URL}/rest-api/v1/loops/date/${formatToday()}`;
// 루프 캘린더 조회
const getLoopCalendar = `${BASE_URL}/rest-api/v1/loops/calendar?year=2026&month=1`;
// 내 팀 리스트 조회
const getMyTeams = `${BASE_URL}/rest-api/v1/teams/my`;
// 모집 중인 팀 리스트 조회
const getRecruitingTeams = `${BASE_URL}/rest-api/v1/teams/recruiting`;
// 팀 상세 조회 (유저별 teamId 동적)
const getTeamDetailUrl = (teamId) => `${BASE_URL}/rest-api/v1/teams/${teamId}`;
// 팀 루프 리스트 조회 (유저별 teamId 동적)
const getTeamLoopsUrl = (teamId) => `${BASE_URL}/rest-api/v1/teams/${teamId}/loops`;
// 팀 루프 상세 조회 (내 루프) (유저별 teamId/teamLoopId 동적)
const getTeamLoopMyDetailUrl = (teamId, teamLoopId) =>
    `${BASE_URL}/rest-api/v1/teams/${teamId}/loops/${teamLoopId}/my`;
// 팀 루프 상세 조회 (팀 루프) (유저별 teamId/teamLoopId 동적)
const getTeamLoopDetailUrl = (teamId, teamLoopId) =>
    `${BASE_URL}/rest-api/v1/teams/${teamId}/loops/${teamLoopId}/all`;
// 팀 루프 캘린더 조회 (유저별 teamId 동적)
const getTeamLoopCalendarUrl = (teamId) =>
    `${BASE_URL}/rest-api/v1/teams/${teamId}/loops/calendar?year=2026&month=1`;

// -------------------- setup() (smoke.js 패턴 그대로) --------------------
export function setup() {
    const emails = loadAccountSetup(); // stress용 계정 로더
    const MAX_SESSIONS = 50; // smoke.js처럼 세션 풀 제한
    const targetEmails = emails.slice(0, MAX_SESSIONS);
    const sessions = loginSetup(targetEmails);

    if (!sessions.length) {
        throw new Error("No sessions created in setup()");
    }
    return { sessions };
}

// -------------------- helpers (smoke.js 그대로) --------------------
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
        },
        tags: {
            userKey: session.userKey,
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

// -------------------- VU flow (smoke.js 그대로) --------------------
export default function (data) {
    const session = pickSession(data);
    const userNo = parseUserNo(session);
    const loopId = firstLoopIdForUser(userNo);
    const teamId = teamIdForUser(userNo);
    const teamLoopId = firstTeamLoopIdForTeam(teamId);

    get(getMyInfo, session, "getMyInfo");
    sleep(1);

    get(getLoopCalendar, session, "getLoopCalendar");
    sleep(1);

    get(getDailyLoopsUrl(), session, "getDailyLoops");
    sleep(1);

    get(getDetailLoopUrl(loopId), session, `getDetailLoop(loopId=${loopId})`);
    sleep(1);

    get(getLoopReport, session, "getLoopReport");
    sleep(1);

    get(getMyTeams, session, "getMyTeams");
    sleep(1);

    get(getRecruitingTeams, session, "getRecruitingTeams");
    sleep(1);

    get(getTeamDetailUrl(teamId), session, `getTeamDetail(teamId=${teamId})`);
    sleep(1);

    get(getTeamLoopsUrl(teamId), session, `getTeamLoops(teamId=${teamId})`);
    sleep(1);

    get(
        getTeamLoopMyDetailUrl(teamId, teamLoopId),
        session,
        `getTeamLoopMyDetail(teamId=${teamId}, teamLoopId=${teamLoopId})`
    );
    sleep(1);

    get(
        getTeamLoopDetailUrl(teamId, teamLoopId),
        session,
        `getTeamLoopDetail(teamId=${teamId}, teamLoopId=${teamLoopId})`
    );
    sleep(1);

    get(getTeamLoopCalendarUrl(teamId), session, `getTeamLoopCalendar(teamId=${teamId})`);
    sleep(1);
}
