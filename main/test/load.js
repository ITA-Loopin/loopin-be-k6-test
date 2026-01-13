import http from "k6/http";
import { sleep } from 'k6';
import { check } from "k6";
import { loginSetup } from "../setup/loginSetup.js";
import { loadAccountSetup } from "../setup/loadAccountSetup.js";
import { BASE_URL } from "../setup/config.js";

export const options = {
    stages: [
        { duration: "5m", target: 110 },
        { duration: "5m", target: 110 },
        { duration: "5m", target: 220 },
        { duration: "5m", target: 220 },
        { duration: "5m", target: 0 },
    ],
    thresholds: {
        http_req_duration: ["p(95)<500"],
    },
};

export function setup() {
    const users = loadAccountSetup();
    const tokens = loginSetup(users);
    return { tokens };
}

export default function (data) {
    const tokens = data.tokens;
    const token = tokens[(__VU - 1) % tokens.length];

    const userIndex = (__VU - 1) % tokens.length;
    const isStudent = userIndex < 104;
    const isTeacher = userIndex >= 104 && userIndex < 116;
    const isParent = userIndex >= 116;

    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };

    const requests = [];

    // 학생 권한 요청
    if (isStudent) {
        requests.push(
            { method: "GET", url: `${BASE_URL}/rest-api/v1/member/detail` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/attendance/filter?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/grade/filter?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/feedback/filter?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/notification` },
        );
    }

    // 학부모 권한 요청
    if (isParent) {
        const studentId = userIndex - 51;
        requests.push(
            { method: "GET", url: `${BASE_URL}/rest-api/v1/attendance/filter/${studentId}?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/grade/filter/${studentId}?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/feedback/filter/${studentId}?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/counsel/filter/${studentId}?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/specialty/filter/${studentId}?year=1&semester=1` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/notification` },
        );
    }

    // 선생님 권한 요청
    if (isTeacher) {
        requests.push(
            { method: "GET", url: `${BASE_URL}/rest-api/v1/member/students` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/attendance/filter/351?year=1&semester=2` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/grade/filter/351?year=1&semester=2` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/feedback/filter/351?year=1&semester=2` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/counsel/filter/351?year=1&semester=2` },
            { method: "GET", url: `${BASE_URL}/rest-api/v1/specialty/filter/351?year=1&semester=2` },
        );
    }

    const allowedReturnCodes = [
        "SUCCESS", "NOT_AUTHORIZED", "INTERNAL_SERVER_ERROR", "USER_NOT_FOUND", "PAGE_REQUEST_FAIL",
        "INVALID_ACCOUNT_ID", "MEMBER_ALREADY_EXISTS", "INVALID_ROLE", "GRADE_NOT_FOUND", "INVALID_SUBJECT",
        "ATTENDANCE_NOT_FOUND", "FEEDBACK_NOT_FOUND", "COUNSEL_NOT_FOUND", "SPECIALTY_NOT_FOUND",
        "INVALID_SEMESTER", "CLASSID_NOT_FOUND", "NOTIFICATION_NOT_FOUND",
    ];

    for (const req of requests) {
        const res = http.get(req.url, {
            headers,
            tags: { custom_url: getCustomUrl(req.url) } // 쿼리 파라미터 제거
        });

        let resBody = {};
        try {
            resBody = res.json();
        } catch (e) {
            console.error(`[ERROR] Invalid JSON from ${req.url}`);
            continue;
        }

        const rc = resBody?.returnCode || "NO_CODE";
        const isKnownCode = allowedReturnCodes.includes(rc);
        const label = `${req.method} ${req.url}`;

        const passed = check(resBody, {
            [`${label} - returnCode is known`]: () => isKnownCode,
        });

        if (!passed) {
            console.warn(`[WARN] Unexpected returnCode for ${label}: ${rc}`);
            console.warn(`Response body: ${JSON.stringify(resBody)}`);
        }

        sleep(Math.random() * 3);
    }

    function getCustomUrl(url) {
        const filterIndex = url.indexOf("filter");
        if (filterIndex === -1) {
            // filter 없으면 원본 반환
            return url;
        }
        // filter 위치부터 뒤 문자열
        const afterFilter = url.slice(filterIndex + "filter".length);

        // 뒤에 ?나 / 중 첫번째 위치 찾기
        const nextCharIndex = afterFilter.search(/[?/]/);

        if (nextCharIndex === -1) {
            // ?나 / 가 없으면 filter 끝까지 반환
            return url;
        }

        // filter부터 ? 또는 / 까지 자르기
        return url.slice(0, filterIndex + "filter".length + nextCharIndex + 1);
    }
}
