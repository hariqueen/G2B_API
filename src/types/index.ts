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
