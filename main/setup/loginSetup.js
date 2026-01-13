import http from "k6/http";
import { check } from "k6";
import { BASE_URL } from "./config.js";

export function loginSetup(users) {
    const accessTokens = [];

    for (const user of users) {
        const loginPayload = JSON.stringify(user);
        const loginHeaders = { "Content-Type": "application/json" };

        const loginRes = http.post(
            `${BASE_URL}/rest-api/v1/auth/login`,
            loginPayload,
            { headers: loginHeaders }
        );

        const resBody = loginRes.json();

        check(resBody, {
            "login success": () => resBody?.returnCode === "SUCCESS" && resBody?.data?.accessToken !== undefined,
        });

        if (resBody?.returnCode === "SUCCESS" && resBody?.data?.accessToken) {
            accessTokens.push(resBody.data.accessToken);
        }
    }
    console.log("[setup] loginSetup 완료");
    return accessTokens; // 배열 반환
}
