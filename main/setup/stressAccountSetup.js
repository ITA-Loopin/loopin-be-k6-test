import http from "k6/http";
import { check } from "k6";
import { BASE_URL } from "./config.js";

// 관리자 계정
const adminLogin = {
    accountId: 180771776,
    password: "iEdu77",
};

const infoUrl = `${BASE_URL}/rest-api/v1/admin`;
const loginUrl = `${BASE_URL}/rest-api/v1/auth/login`;

// 날짜 문자열에서 비밀번호 추출
function extractPassword(birthday) {
    return birthday.replaceAll("-", "").slice(2);
}

// 관리자 로그인 후 accessToken 가져오기
function getAdminAccessToken() {
    const res = http.post(loginUrl, JSON.stringify(adminLogin), {
        headers: { "Content-Type": "application/json" },
    });

    const body = res.json();
    check(body, {
        "Admin login success": () => body?.returnCode === "SUCCESS" && body?.data?.accessToken,
    });
    return body.data.accessToken;
}

// 특정 role의 계정 정보들을 page 범위 안에서 가져오기
function fetchAccounts(role, pages, lastPageSize, accessToken) {
    const result = [];
    const defaultPageSize = 25;

    for (let i = 0; i < pages; i++) {
        // 마지막 페이지라면 size를 lastPageSize로 설정
        const size = (i === pages - 1) ? lastPageSize : defaultPageSize;
        const url = `${infoUrl}?role=${role}&page=${i}&size=${size}`;
        const res = http.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const body = res.json();
        check(body, {
            [`Fetch ${role} page ${i} success`]: () => body?.returnCode === "SUCCESS",
        });

        const accounts = body.ieduPage.contents;

        for (const s of accounts) {
            const password = extractPassword(s.birthday);
            result.push({
                accountId: s.accountId,
                password: password,
            });
        }
    }
    return result;
}

// 비밀번호 없이 계정만 가져오기 (학부모용)
function fetchAccountsWithoutPassword(role, pages, lastPageSize, accessToken) {
    const result = [];
    const defaultPageSize = 25;

    for (let i = 0; i < pages; i++) {
        const size = (i === pages - 1) ? lastPageSize : defaultPageSize;
        const url = `${infoUrl}?role=${role}&page=${i}&size=${size}`;
        const res = http.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const body = res.json();
        check(body, {
            [`Fetch ${role} page ${i} success`]: () => body?.returnCode === "SUCCESS",
        });

        const accounts = body.ieduPage.contents;

        for (const s of accounts) {
            result.push({
                accountId: s.accountId,
            });
        }
    }
    return result;
}

// 전체 계정 로딩
export function stressAccountSetup() {
    const accessToken = getAdminAccessToken();

    const students = fetchAccounts("ROLE_STUDENT", 21, 25, accessToken); // 학생 525명
    const parentsRaw = fetchAccountsWithoutPassword("ROLE_PARENT", 21, 25, accessToken); // 학부모 525명

    const parents = parentsRaw.map((parent, index) => ({
        accountId: parent.accountId,
        password: students[index]?.password || "unknown",
    }));

    const teachers = fetchAccounts("ROLE_TEACHER", 3, 1, accessToken); // 선생님 51명

    const users = [...students, ...teachers, ...parents];

    console.log(`총 계정 수: ${users.length}`);
    return users;
}
