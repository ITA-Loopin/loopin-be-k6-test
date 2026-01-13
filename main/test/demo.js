import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    stages: [
        { duration: '2m', target: 5000 }
    ],
};

export default function () {
    http.get("http://localhost:8080/rest-api/v1/member/detail");
    sleep(1);
}


export const options = {
    stages: [
        { duration: "1m", target: 550 },
        { duration: "1m", target: 1101 },
        { duration: "2m", target: 1101 },
        { duration: "1m", target: 0 },
    ],
    thresholds: {
        http_req_duration: ["p(95)<1000"], // 스트레스 조건에서 95% 요청이 1초 이내 응답
    },
    setupTimeout: "300s",
};
