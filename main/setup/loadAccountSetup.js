// user1@example.com ~ user1000@example.com 형태의 이메일 배열 생성
function generateEmails(count = 1000, domain = "example.com", prefix = "user") {
    const emails = new Array(count);
    for (let i = 1; i <= count; i++) {
        emails[i - 1] = `${prefix}${i}@${domain}`;
    }
    return emails;
}

// 전체 계정 로딩(가데이터)
export function loadAccountSetup() {
    const emails = generateEmails(1000);

    console.log(`총 이메일 수: ${emails.length}`);
    console.log(`예시: ${emails[0]}, ${emails[emails.length - 1]}`);

    return emails;
}
