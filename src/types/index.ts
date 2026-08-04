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
    /** 예측에 쓴 용역기간의 출처. 신뢰도 표기에 사용한다. */
    _durationSource?: 'manual' | 'derived' | 'none';
    /** 실제 예측에 적용된 주기(개월). 수동입력이 없으면 이력에서 유도한 값. */
    _effectiveDuration?: number;
    [key: string]: any; // Allow dynamic fields
}

/** 대시보드 도메인. 사이드바 최상위 구분과 같다. */
export type PreSpecDomain = 'callcenter' | 'ax';

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
    /** 공고번호 + 차수. 발주계획은 차수가 붙어 오고(001 등 8%), 사전규격은 없다. */
    bidRefs: { no: string; ord: string }[];
    specDocUrls: string[];      // 규격서 파일 URL (사전규격만)
    keywords: string[];         // 매칭된 검색 키워드
    /** 소속 도메인. 한 건이 양쪽에 걸릴 수 있다(예: "상담센터 AX기반 ISP"). */
    domains: PreSpecDomain[];
    raw: any;
}
