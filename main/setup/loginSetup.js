import http from "k6/http";
import { check } from "k6";
import {BASE_URL} from "./config.js";

//  쿠키 이름을 알고 있으면 정확히 체크 가능
const ACCESS_COOKIE_NAME = "accessToken";
const REFRESH_COOKIE_NAME = "refreshToken";

export function loginSetup(emails) {
    const sessions = [];

    for (const email of emails) {
        const loginPayload = JSON.stringify(email);
        const loginHeaders = { "Content-Type": "application/json" };
        const loginRes = http.post(
            `${BASE_URL}/rest-api/v1/auth/login`,
            loginPayload,
            { headers: loginHeaders }
        );
        // Set-Cookie로 내려온 쿠키는 k6가 loginRes.cookies에 파싱해줌
        // loginRes.cookies 예시: { accessToken: [{value, ...}], refreshToken: [{value, ...}] }
        const cookieMap = {};
        for (const [name, arr] of Object.entries(loginRes.cookies || {})) {
            if (arr && arr.length > 0 && arr[0]?.value != null) {
                cookieMap[name] = arr[0].value;
            }
        }
        // 쿠키 기반 세션 저장
        sessions.push({
            userKey: email,
            cookies: cookieMap,
        });
    }
    console.log("[setup] loginSetup 완료");
    return sessions;
}
