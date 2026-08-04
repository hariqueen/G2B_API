export interface Bid {
    bid_id: string;
    공고명: string;
    실수요기관: string;
    '물동량 평균': number;
    '용역기간(개월)': number;
    '계약 기간 내': number;
    입찰결과_1순위: string;
    입찰금액_1순위: number;
    예상_입찰일: string;
    예상_연도: number;
    예상_입찰월: number;
    예상_년월: string;
    유찰사유?: string;
    is_prediction: boolean;
    prediction_count?: number;
    공고URL?: string;
    reNtceYn?: string;
    bidClseDt?: string;
    bidBeginDt?: string;
    ntceInsttNm?: string;
    ntceInsttOfclNm?: string;
    ntceInsttOfclTelNo?: string;
    ntceSpecDocUrl1?: string;
    ntceSpecFileNm1?: string;
    [key: string]: any; // Allow dynamic fields
}

// 사전규격 / 발주계획 통합 항목.
// 두 API의 필드명이 달라 화면에서 쓰는 값만 정규화해 담는다.
export interface PreSpecItem {
    id: string;
    source: 'pre_spec' | 'order_plan';
    title: string;              // prdctClsfcNoNm | bizNm
    institution: string;        // orderInsttNm
    demandInstitution: string;  // rlDminsttNm (사전규격만)
    amount: number;             // asignBdgtAmt | sumOrderAmt
    postedAt: string;           // rcptDt | nticeDt
    deadlineAt: string;         // opninRgstClseDt (사전규격만)
    dday: number | null;        // 의견마감까지 남은 일수. 마감 후 음수
    isSwBiz: boolean;           // swBizObjYn === 'Y'
    officer: string;            // ofclNm
    officerTel: string;         // ofclTelNo | telNo
    department: string;         // deptNm (발주계획만)
    orderYm: string;            // 발주예정 YYYY-MM (발주계획만)
    isNoticed: boolean;         // 공고 전환 여부
    bidNtceNos: string[];       // 정규화된 관련 입찰공고번호
    specDocUrls: string[];      // 규격서 파일 URL (사전규격만)
    keywords: string[];         // 매칭된 검색 키워드
    raw: any;
}
