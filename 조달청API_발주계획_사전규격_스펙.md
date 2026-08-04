# 조달청 나라장터 OpenAPI 연동 스펙 — 발주계획 / 사전규격

공공 입찰 대시보드에 **발주계획현황**과 **사전규격 공개** 목록을 추가하기 위한 API 스펙 정리.
기존에 입찰공고 내역은 이미 연동되어 있으며, 동일한 패턴으로 두 서비스를 추가한다.

> 이 문서는 조달청 공식 OpenAPI 참고자료(v1.0) docx 2건에서 발췌·정리한 것이다.
> **2026-08-04 실제 호출로 검증 완료.** 검증된 항목은 ✅, 실측값은 「실측」으로 표시했다.

---

## 0. 활용신청 현황 (2026-08-04 기준)

| 서비스 | 상태 | 비고 |
|---|---|---|
| **사전규격정보** `HrcspSsstndrdInfoService` | ✅ **승인** | 개발계정, 활용기간 2026-08-04 ~ 2028-08-04 |
| **발주계획현황** `OrderPlanSttusService` | ✅ **승인** | 오퍼레이션 8종 전체, 각 일 1,000건 |

- 인증키는 기존 입찰공고 수집기와 **동일한 `BID_API_KEY`** 를 그대로 사용한다 (별도 키 불필요).
- **일일 트래픽: 오퍼레이션당 1,000건** (개발계정). 운영계정 전환 시 상향 신청 필요.
- 두 서비스 모두 실호출 검증 완료.

---

## 1. 서비스 개요

| 구분 | 발주계획현황 | 사전규격정보 |
|---|---|---|
| 서비스 ID | `OrderPlanSttusService` | `HrcspSsstndrdInfoService` |
| 베이스 URL | `https://apis.data.go.kr/1230000/ao/OrderPlanSttusService` | `https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService` |
| 오퍼레이션 수 | 8 | 20 |
| 키워드 검색 파라미터 | `bizNm` (사업명) | `prdctClsfcNoNm` (품명/사업명) |
| 기간 기준 | 게시일시 (`nticeDt`) | 접수일시 (`rcptDt`) |
| 업무구분 | 물품 / 공사 / 용역 / 외자 (오퍼레이션 분리) | 물품 / 공사 / 용역 / 외자 (오퍼레이션 분리) |

> ⚠️ **반드시 `https` 를 사용할 것.** 「실측」
> 포털 문서와 예제 URI에는 `http://` 로 표기된 곳이 있으나, `apis.data.go.kr` 의 **80번 포트는 응답하지 않아 연결 타임아웃**(30초)이 발생한다.
> 443(`https`)으로 호출해야 정상 응답한다. 활용신청 상세의 End Point 역시 `https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService` 로 안내된다.

**두 서비스 모두 업무구분이 오퍼레이션 단위로 분리되어 있다.** 통합 검색 UI를 만들려면 업무구분별로 4회 호출 후 머지해야 한다.

---

## 2. 공통 규칙

### 인증 및 공통 파라미터

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `ServiceKey` | 필수 | 공공데이터포털 인증키. **대문자 S 주의** (`serviceKey` 아님) |
| `type` | 옵션 | `json` 지정 시 JSON 응답. 미지정 시 XML |
| `pageNo` | 아래 참조 | 페이지 번호 |
| `numOfRows` | 아래 참조 | 페이지당 결과 수 |

- 발주계획: `pageNo` / `numOfRows` 옵션
- 사전규격: `pageNo` / `numOfRows` **필수**

### ServiceKey 인코딩 주의

공공데이터포털은 Encoding/Decoding 두 가지 키를 제공한다. HTTP 클라이언트가 쿼리스트링을 자동 인코딩하는 경우(axios 등) **Decoding 키**를 사용해야 하며, Encoding 키를 그대로 넣으면 `%` 가 이중 인코딩되어 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 발생한다. 기존 입찰공고 연동 코드에서 쓰는 방식을 그대로 따를 것.

### 응답 구조

```
response
├─ header
│  ├─ resultCode   "00" = 정상
│  └─ resultMsg
└─ body
   ├─ items[]      // 결과 목록
   ├─ numOfRows
   ├─ pageNo
   └─ totalCount   // 전체 건수 → 페이징 계산에 사용
```

`resultCode !== "00"` 이면 에러로 처리. HTTP 200으로 내려오면서 body에 에러가 담기는 경우가 있으므로 status code만 보고 판단하지 말 것.

### ⚠️ 에러 응답은 최상위 키가 다르다 「실측」

**정상과 에러의 JSON 루트 키가 서로 다르다.** `payload["response"]` 로 바로 접근하면 에러 시 `KeyError` 가 난다.

| 상황 | 루트 키 | 예시 |
|---|---|---|
| 정상 | `response` | `{"response":{"header":{"resultCode":"00"},...}}` |
| 파라미터 오류 | `nkoneps.com.response.ResponseError` | `resultCode: "07"`, `resultMsg: "입력범위값 초과 에러"` |
| 인증 실패 | `OpenAPI_ServiceResponse` | `cmmMsgHeader.errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"` (HTTP 403) |

```python
def parse(payload):
    if "response" in payload:
        return payload["response"]["body"]
    root = next(iter(payload))                       # 에러 envelope
    h = payload[root].get("header") or payload[root].get("cmmMsgHeader")
    raise RuntimeError(f"{root}: {h}")
```

### ⚠️ 조회 기간 상한 = 365일 「실측」

`inqryBgnDt` ~ `inqryEndDt` 간격이 **365일을 넘으면** `resultCode 07 입력범위값 초과 에러`.

| 간격 | 결과 |
|---|---|
| 364일 | ✅ 정상 |
| **365일** | ✅ **정상 (상한)** |
| 366일 | ❌ 07 에러 |

→ 1년 이상 백필이 필요하면 **365일 단위로 청크 분할**할 것.

### numOfRows 상한 「실측」

`numOfRows=999` 까지 정상 동작 확인 (10/50/99/100/200/999 전부 `resultCode 00`).
초기 백필 시 페이지 수를 줄이려면 999를 쓰는 편이 호출량(일 1,000건 제한) 절약에 유리하다.

### 날짜 포맷

| 용도 | 포맷 | 예시 |
|---|---|---|
| 요청 — 조회일시 | `YYYYMMDDHHmm` (12자리) | `202608010000` |
| 요청 — 발주년월 | `YYYYMM` (6자리) | `202608` |
| 응답 — 일시 | `YYYY-MM-DD HH:MM:SS` | `2016-05-01 08:59:00` |

---

## 3. 발주계획현황 서비스

### 3.1 오퍼레이션 목록

| # | 오퍼레이션명 | 업무 | 키워드 검색 |
|---|---|---|---|
| 1 | `getOrderPlanSttusListThng` | 물품 | ❌ |
| 2 | `getOrderPlanSttusListCnstwk` | 공사 | ❌ |
| 3 | `getOrderPlanSttusListServc` | 용역 | ❌ |
| 4 | `getOrderPlanSttusListFrgcpt` | 외자 | ❌ |
| **5** | **`getOrderPlanSttusListThngPPSSrch`** | 물품 | ✅ |
| **6** | **`getOrderPlanSttusListCnstwkPPSSrch`** | 공사 | ✅ |
| **7** | **`getOrderPlanSttusListServcPPSSrch`** | 용역 | ✅ |
| **8** | **`getOrderPlanSttusListFrgcptPPSSrch`** | 외자 | ✅ |

**→ 5~8번 `PPSSrch` 계열만 사용한다.** 1~4번은 `inqryDiv`(**1**=발주년월·게시일시, **2**=발주계획통합번호) 기반이라 키워드 검색이 불가능하다.

> ⚠️ **발주계획은 필수 절차가 아니다.** 공식 설명에 다음이 명시되어 있다.
> *"반드시 발주계획정보가 존재하여야만 사전규격공개를 하거나 입찰공고를 등록할 수 있는 것은 아니며, 발주계획정보에 존재하지 않는 규격의 공개나 입찰공고 및 계약정보가 존재할 수 있습니다."*
>
> → **발주계획 → 사전규격 → 입찰공고 3단 연결은 일부 구간이 비어 있을 수밖에 없다.** 발주계획을 "전체 파이프라인"이 아니라 **조기 탐지 보조 채널**로 설계할 것. 커버리지는 활용신청 승인 후 실측해야 한다(미승인 상태라 현재 측정 불가).

### 3.2 요청 파라미터 (PPSSrch 공통)

| 파라미터 | 국문 | 크기 | 필수 | 예시 | 비고 |
|---|---|---|---|---|---|
| `ServiceKey` | 서비스키 | 400 | ✅ | — | |
| `type` | 타입 | 4 | | `json` | |
| `numOfRows` | 페이지당 건수 | 4 | | `10` | |
| `pageNo` | 페이지 번호 | 4 | | `1` | |
| `orderBgnYm` | 발주시작년월 | 6 | | `202601` | **미입력 시 현재일 기준 1개월** |
| `orderEndYm` | 발주종료년월 | 6 | | `202612` | **미입력 시 현재일 기준 1개월** |
| `inqryBgnDt` | 조회시작일시 | 12 | | `202608010000` | 게시일시 기준. **미입력 시 현재일 기준 1일** |
| `inqryEndDt` | 조회종료일시 | 12 | | `202608312359` | 게시일시 기준. **미입력 시 현재일 기준 1일** |
| `orderInsttCd` | 발주기관코드 | 7 | | `7000126` | |
| `orderInsttNm` | 발주기관명 | 200 | | `경북대학교` | |
| `prcrmntMethd` | 조달방식 | 20 | | `자체조달` | `중앙조달` \| `자체조달` |
| `insttLctNm` | 기관소재지명 | 100 | | `서울특별시` | |
| **`bizNm`** | **사업명** | **400** | | 아래 참조 | **키워드 검색용** |

### 3.3 업무구분별 추가 파라미터

| 파라미터 | 물품 | 공사 | 용역 | 외자 |
|---|:---:|:---:|:---:|:---:|
| `dtilPrdctClsfcNo` (세부품명번호, 10자리) | ✅ | — | — | — |
| `agrmntYn` (협정여부, Y/N) | ✅ | — | — | — |
| `bsnsTyCd` / `bsnsTyNm` (업무유형) | — | ✅ | ✅ | ✅ |
| `cnsttyDivNm` (공종구분명) | — | ✅ | ✅ | — |

### 3.4 주요 응답 필드

| 필드 | 설명 | 대시보드 활용 |
|---|---|---|
| `orderPlanUntyNo` | 발주계획통합번호 | **PK** — `업무구분(1)-업무유형(3)-발주년도(4)-기관코드(7)-순번(6)`, 예 `1-1-2016-7000126-000009` |
| `bizNm` | 사업명 | 목록 타이틀 |
| `bsnsDivCd` / `bsnsDivNm` | 업무구분 | **`1`=물품, `2`=외자, `3`=공사, `5`=용역** (공식 명세 기준) |
| `bsnsTyCd` / `bsnsTyNm` | 업무유형 | `1`=신규, `2`=장기, 그 외=해당없음 |
| `jrsdctnDivCd` | 소관구분코드 | `01`국가기관 `02`지자체 `03`교육기관 `51`공기업 `52`준정부 `53`기타공공 `71`지방공기업 `72`기타 `81`지자체출자출연 |
| `rmrkCntnts` | 비고내용 (4000자) | 담당부서 메모. 일정 변경 가능성 등이 기재됨 |
| `orderContrctAmt` / `orderGovsplyMtrcst` / `orderEtcAmt` | 도급/관급자재/기타 금액 | `sumOrderAmt` 의 내역 |
| `ntceNticeYn` | 공고게시여부 | 실제 공고 전환 추적 |
| `orderYear` / `orderMnth` | 발주년/월 | |
| `orderInsttNm` / `orderInsttCd` | 발주기관 | |
| `totlmngInsttNm` | 총괄기관명 | |
| `jrsdctnDivNm` | 소관구분명 | 국가기관/지자체/공기업 등 필터 |
| `sumOrderAmt` | 발주총액(원) | 금액 정렬·집계 |
| `sumOrderDolAmt` | 발주총액(외화) | 외자 전용 |
| `cntrctMthdNm` | 계약방법명 | |
| `prcrmntMethd` | 조달방식 | |
| `nticeDt` | 게시일시 | 정렬 기준 |
| `chgDt` | 변경일시 | 증분 동기화용 |
| `deptNm` / `ofclNm` / `telNo` | 담당부서/담당자/연락처 | 상세 |
| `prdctClsfcNo` / `dtilPrdctClsfcNo` / `dtilPrdctClsfcNoNm` | 물품분류 | |
| `cnsttyDivNm` / `cnstwkRgnNm` | 공종구분 / 공사지역 | 공사 |
| `specItemNm1~5` / `specItemCntnts1~5` | 규격항목명/내용 | 상세 |
| **`bidNtceNoList`** | **관련 입찰공고번호 목록** | **기존 입찰공고 테이블과 조인** |

### 3.5 ⚠️ `bidNtceNoList` 형식이 사전규격과 다르다 「실측」

**같은 이름의 필드지만 두 서비스의 값 형식이 다르다.** 이걸 놓치면 조인율이 0%가 된다 (실제로 겪음).

| 서비스 | 실제 값 | 길이 | 구성 |
|---|---|---|---|
| 사전규격 | `R25BK01024415` | 13자 | 공고번호만 |
| **발주계획** | `R26BK01648198000` | **16자** | 공고번호(13) + **차수(3)**, **구분자 없음** |

```python
def norm_bid_no(n: str) -> str:
    """발주계획의 16자 값에서 차수 3자리를 떼어낸다."""
    n = n.strip()
    return n[:-3] if len(n) == 16 and n[-3:].isdigit() else n
```

정규화 적용 전 RTDB 조인율 **0%** → 적용 후 **297/297 (100%)**.

### 3.6 「실측」 발주계획 데이터 규모 (키워드 13개 · 용역 · 게시일 최근 365일)

| 지표 | 값 |
|---|---|
| 발주계획 고유 | **346건** |
| `bidNtceNoList` 보유 | 241건 (**69%**) |
| `ntceNticeYn` | `Y` 241건 / `N` **105건 (30%)** ← 아직 공고 안 된 건 |
| 참조 공고번호 297개 중 RTDB 매칭 | **297개 (100%)** (정규화 후) |
| 게시일 → 입찰일 리드타임 | 중앙값 **7일** |

### 3.7 ⚠️ 발주계획은 "연간 계획"이 아니다 「실측」

이름과 달리 **대부분 입찰 직전에 등록된다.** 조기 신호로 기대하면 안 된다.

| 지표 | 실측 |
|---|---|
| 게시월 → 발주예정월 | **중앙값 0개월** (346건 중 256건이 **같은 달**) |
| 1개월 이상 미래 예정 | 89건 (**25%**) |
| 게시 → 사전규격 접수 간격 | **중앙값 0일** |
| 발주계획이 사전규격보다 먼저인 비율 | 260건 중 56건 (**21%**) |

**→ 발주계획과 사전규격은 사실상 동시에 뜬다.** 발주계획의 가치는 "먼저 안다"가 아니라 아래 두 가지다.

1. **커버리지 보완** — 사전규격 없이 발주계획만 있는 공고가 **37개**. 사전규격만 보면 놓친다.
2. **담당자 정보** — `deptNm` / `ofclNm` / `telNo` 로 발주 부서·담당자·연락처를 제공한다. 사전규격에는 `ofclNm`/`ofclTelNo` 만 있고 부서명이 없다.

---

## 4. 사전규격정보 서비스

### 4.1 오퍼레이션 목록 (20개, 4계열 × 4업무)

| 계열 | 패턴 | 용도 |
|---|---|---|
| 전체 목록 | `getPublicPrcureThngInfo{Thng,Cnstwk,Servc,Frgcpt}` | 등록일시/등록번호/**변경일시** 기반 |
| 기관별 | `getInsttAcctoThngListInfo{...}` | 기관명 기반 |
| 품목별 | `getThngDetailMetaInfo{...}` | 품명 기반 |
| **나라장터 검색조건** | **`getPublicPrcureThngInfo{...}PPSSrch`** | **← 키워드 검색용, 주력** |
| 규격서 의견 | `getPublicPrcureThngOpinionInfo{...}` | 의견 목록 (사전규격번호로 조인) |

### ⚠️ `inqryDiv` 의미가 오퍼레이션 계열마다 다르다 「실측」

동일한 파라미터명이지만 **PPSSrch 여부에 따라 값의 뜻이 바뀐다.** 혼동하기 쉬운 지점이다.

| `inqryDiv` | 기본 (`...Servc`) | 검색조건 (`...ServcPPSSrch`) |
|:---:|---|---|
| `1` | 등록일시 (`rgstDt`) | 접수일시 (`rcptDt`) |
| `2` | 사전규격등록번호 | 사전규격등록번호 |
| `3` | **변경일시 (`chgDt`)** | 참조번호 (`refNo`) |
| 키워드 검색 | ❌ 불가 | ✅ `prdctClsfcNoNm` |

세 모드 전부 실호출 검증 완료 (용역 기준, 2026-07-01~08-04):
`inqryDiv=1` → 5,741건 · `inqryDiv=3` → 5,230건 · `inqryDiv=2` → 1건

**→ 증분 동기화에는 기본 오퍼레이션의 `inqryDiv=3`(변경일시)이 유일한 정공법이다.** 단 키워드 필터가 불가하므로 전량을 받아 클라이언트에서 걸러야 한다.

사용할 4개:

- `getPublicPrcureThngInfoThngPPSSrch` (물품)
- `getPublicPrcureThngInfoCnstwkPPSSrch` (공사)
- `getPublicPrcureThngInfoServcPPSSrch` (용역)
- `getPublicPrcureThngInfoFrgcptPPSSrch` (외자)

### 4.2 요청 파라미터 (PPSSrch 공통)

| 파라미터 | 국문 | 크기 | 필수 | 예시 | 비고 |
|---|---|---|---|---|---|
| `ServiceKey` | 서비스키 | 400 | ✅ | — | |
| `type` | 타입 | 4 | | `json` | |
| `numOfRows` | 페이지당 건수 | 4 | ✅ | `10` | **필수** |
| `pageNo` | 페이지 번호 | 4 | ✅ | `1` | **필수** |
| **`inqryDiv`** | **조회구분** | 1 | ✅ | `1` | **`1`=접수일시, `2`=사전규격등록번호, `3`=참조번호** |
| `inqryBgnDt` | 조회시작일시 | 12 | | `202608010000` | `inqryDiv=1`일 때 사용 |
| `inqryEndDt` | 조회종료일시 | 12 | | `202608312359` | `inqryDiv=1`일 때 사용 |
| `bfSpecRgstNo` | 사전규격등록번호 | 10 | | `347516` | `inqryDiv=2`일 때 사용 |
| `refNo` | 참조번호 | 15 | | — | `inqryDiv=3`일 때 사용 |
| `ntceInsttCd` | 공고기관코드 | 7 | | — | |
| `ntceInsttNm` | 공고기관명 | 200 | | `조달청 서울지방조달청` | |
| `dminsttCd` | 수요기관코드 | 7 | | — | |
| `dminsttNm` | 수요기관명 | 200 | | `한국환경산업기술원` | |
| **`prdctClsfcNoNm`** | **품명** | **200** | | 아래 참조 | **키워드 검색용** |
| `swBizObjYn` | SW사업대상여부 | 1 | | `Y` | SW 사업 필터 |
| `dtilPrdctClsfcNo` | 세부품명번호 | 10 | | `4321150102` | **물품·용역만** |

**업무구분별 차이는 `dtilPrdctClsfcNo` 하나뿐이다.** 외자·공사에는 없다.

### 4.3 주요 응답 필드

> ⚠️ **`bfSpecRgstNo` 실제 형식이 공식 문서와 다르다.** 「실측」
> 문서에는 크기 10, 샘플 `356759`(순수 숫자)로 되어 있으나, **실제 응답은 `R26BD00175439` 형태의 13자 영숫자 문자열**이다.
> 숫자형으로 파싱하면 안 되며, 컬럼 크기도 10이 아닌 최소 20으로 잡을 것.

| 필드 | 설명 | 대시보드 활용 |
|---|---|---|
| `bfSpecRgstNo` | 사전규격등록번호 | **PK**, 의견 조회 조인키 |
| `refNo` | 참조번호 | |
| `prdctClsfcNoNm` | 품명(사업명) | 목록 타이틀 |
| `bsnsDivNm` | 업무구분명 | |
| `orderInsttNm` | 발주(공고)기관명 | |
| `rlDminsttNm` | 실수요기관명 | |
| `asignBdgtAmt` | 배정예산금액(원) | 금액 정렬·집계 |
| `rcptDt` | 접수일시 | 정렬 기준 |
| **`opninRgstClseDt`** | **의견등록마감일시** | **D-day 뱃지 / 마감임박 정렬** |
| `ofclNm` / `ofclTelNo` | 담당자 / 연락처 | 상세 |
| `swBizObjYn` | SW사업대상여부 | 필터 |
| `dlvrTmlmtDt` / `dlvrDaynum` | 납품기한일시 / 납품일수 | |
| `specDocFileUrl1~5` | 규격서 파일 URL | 다운로드 링크 (최대 5개) |
| `prdctDtlList` | 물품상세목록 | 파싱 필요 (아래 참조) |
| `rgstDt` / `chgDt` | 등록/변경일시 | 증분 동기화용 |
| **`bidNtceNoList`** | **관련 입찰공고번호 목록** | **입찰공고 테이블과 조인** |

### 4.4 `prdctDtlList` 파싱

```
[1^4321150102^컴퓨터서버],[2^4321150901^태블릿컴퓨터]
```

- 레코드 구분: `],[` (양끝 `[` `]` 제거)
- 필드 구분: `^`
- 필드 순서: `사전규격물품순번` ^ `세부품명번호` ^ `세부품명`
- 최대 길이 4000바이트

```ts
function parsePrdctDtlList(raw: string) {
  if (!raw?.trim()) return [];
  return raw
    .split("],[")
    .map((s) => s.replace(/^\[|\]$/g, ""))
    .filter(Boolean)
    .map((s) => {
      const [sno, dtilPrdctClsfcNo, dtilPrdctClsfcNoNm] = s.split("^");
      return { sno: Number(sno), dtilPrdctClsfcNo, dtilPrdctClsfcNoNm };
    });
}
```

### 4.5 `bidNtceNoList` 파싱

```
20160530525,20160436243,20160412564
```

콤마 구분 문자열. 공백이 섞여 들어오는 샘플이 있으므로 `split(",").map(s => s.trim()).filter(Boolean)` 로 처리.

---

## 5. 구현 가이드

### 5.1 통합 검색 어댑터

두 서비스 모두 업무구분 4개로 오퍼레이션이 나뉘므로, 하나의 검색어에 대해 **최대 8회 호출**이 발생한다.

```
사용자 키워드 입력
  ├─ 발주계획   → Thng / Cnstwk / Servc / Frgcpt PPSSrch  (bizNm=keyword)
  └─ 사전규격   → Thng / Cnstwk / Servc / Frgcpt PPSSrch  (prdctClsfcNoNm=keyword, inqryDiv=1)
```

- `Promise.allSettled` 로 병렬 호출하고 일부 실패는 부분 결과로 처리
- **초당 최대 30 TPS** 제한이 명시되어 있으므로 동시 요청 수 제어 필요
- 각 오퍼레이션이 독립적으로 페이징되므로, 통합 목록의 페이징은 서버측 캐싱 또는 "업무구분 탭 분리" 방식이 단순하다
- 응답에 업무구분 태그를 붙여 정규화

### 5.2 정규화 스키마 제안

```ts
type ProcurementItem = {
  source: "order_plan" | "pre_spec" | "bid_notice";
  id: string;              // orderPlanUntyNo | bfSpecRgstNo | bidNtceNo
  title: string;           // bizNm | prdctClsfcNoNm | bidNtceNm
  bsnsDiv: "물품" | "공사" | "용역" | "외자";
  institution: string;     // orderInsttNm
  demandInstitution?: string; // rlDminsttNm (사전규격만)
  amount?: number;         // sumOrderAmt | asignBdgtAmt
  postedAt: string;        // nticeDt | rcptDt
  deadlineAt?: string;     // opninRgstClseDt (사전규격만)
  relatedBidNotices: string[]; // bidNtceNoList
  raw: unknown;
};
```

### 5.3 3단 연결 (권장 기능)

`bidNtceNoList`가 발주계획·사전규격 양쪽에 모두 존재하므로 다음 타임라인 구성이 가능하다.

```
발주계획 (연간 계획)
    ↓ bidNtceNoList
사전규격 공개 (의견수렴)
    ↓ bidNtceNoList
입찰공고 (기존 연동됨)
```

기존 입찰공고 테이블의 공고번호를 키로 역인덱스를 만들어두면 상세 화면에서 전체 흐름을 표시할 수 있다.

### 5.4 기간 파라미터 필수 처리

**두 서비스 모두 기간 미지정 시 조회 범위가 극단적으로 좁아진다.**

- 발주계획: `inqryBgnDt`/`inqryEndDt` 미입력 → 최근 **1일**, `orderBgnYm`/`orderEndYm` 미입력 → 최근 **1개월**
- 사전규격: `inqryDiv=1` 사용 시 기간 지정 필요

→ 키워드 검색 시 기본 조회 범위를 명시적으로 설정할 것 (예: 최근 6개월). UI에 기간 선택기를 두는 것을 권장.

### 5.5 증분 동기화

배치로 적재한다면 `chgDt`(변경일시)를 활용해 변경분만 갱신. 사전규격은 `rgstDt`도 함께 제공된다.

---

## 6. 주의사항 / 미검증 항목

### ✅ 검증 완료 (2026-08-04 실호출)

기존에 미검증으로 남아 있던 3개 항목이 모두 해소되었다.

1. **키워드 부분일치 — ✅ 부분일치(LIKE) 동작**
   `prdctClsfcNoNm=콜센터` → 44건 반환. 반환된 품명이 아래처럼 **키워드를 포함한 긴 사업명**이다. 완전일치가 아니므로 별도 색인 전략은 불필요하다.
   - `2026년 경기도 청년 노동자 지원사업 콜센터 운영 용역`
   - `업무위탁(안내, 주차, 콜센터) 용역`
   - `콜센터 재구축을 위한 정보화전략계획(ISP) 수립 용역`

2. **`inqryDiv=1` + `prdctClsfcNoNm` 조합 — ✅ 정상 동작**
   접수일시 기간 조회와 품명 검색을 함께 걸어도 `resultCode 00`. 기존 입찰공고 수집기와 동일한 패턴으로 쓸 수 있다.

3. **`prdctClsfcNoNm` 매칭 대상 — ✅ 사업명 전체에 매칭**
   물품분류명이 아니라 **사업명**에 매칭된다. 위 예시처럼 물품분류와 무관한 서술형 사업명이 그대로 반환된다.

### ✅ `bidNtceNoList` 조인 실증

기존 대시보드 RTDB(`/bids`)와의 조인 가능성을 실제 데이터로 확인했다.

| 항목 | 결과 |
|---|---|
| 대시보드 등록 키워드 13개로 수집한 사전규격 (최근 365일, 용역) | **271건** |
| 이 중 `bidNtceNoList` 가 채워진 건 | **249건 (91%)** |
| 참조된 입찰공고번호 (고유) | 325개 |
| 그중 RTDB `/bids` 에 존재 | **325개 (100%)** |

- 15건을 RTDB 개별 조회로 교차 확인했고 **전부 사업명까지 일치**했다.
- **조인 키 주의**: `bidNtceNoList` 는 `R25BK01024415` 처럼 **차수 없는 순수 공고번호**다.
  - RTDB `/bids/{연}/{월}/{공고번호}` → 키가 순수 공고번호라 **그대로 조인 가능**
  - Firestore `bid_pblanc_list` → 문서 ID가 `R26BK01649424-000` 처럼 **차수 접미사 포함**. `split("-")[0]` 로 정규화 후 조인해야 한다.

### 「실측」 데이터 규모 (대시보드 키워드 13개 · 용역 · 최근 365일)

| 지표 | 값 |
|---|---|
| 사전규격 건수 | 271건 (월평균 **22.6건**) |
| 의견수렴 기간 (접수 → 의견마감) | 중앙값 **5일**, 평균 5.1일 (최소 3, 최대 41) |
| SW사업 대상 | 65건 (23%) |
| 배정예산 중앙값 | 2.28억 (합계 3,380억) |
| 키워드별 상위 | 콜센터 152 · 상담센터 32 · 상담시스템 32 · 고객센터 31 |
| `민원센터` 키워드 | **0건** |

> **의견수렴 기간이 중앙값 5일로 매우 짧다.** 월 22.6건 ÷ 30일 × 5일 ≈ **상시 3~4건**만 "의견등록 진행중" 상태다.
> 마감임박 기능은 대량 목록이 아니라 **소수 고신호 알림**으로 설계해야 하며, 수집 주기가 5일보다 길면 의견 제출 기회를 놓친다.

### 문서 오류로 추정되는 항목

발주계획 PPSSrch의 항목구분 표기가 업무구분별로 불일치한다.

- 공사(`getOrderPlanSttusListCnstwkPPSSrch`): `orderEndYm`이 필수(1)로 표기 — 다른 3개는 옵션(0)
- 외자(`getOrderPlanSttusListFrgcptPPSSrch`): `inqryBgnDt`가 필수(1)로 표기 — 다른 3개는 옵션(0)

오타로 보이나, 어차피 기간은 항상 지정해야 하므로 **모든 호출에 4개 기간 파라미터를 전부 채우는 것을 기본 동작으로** 한다.

### 기타

- 최대 메시지 사이즈 4000 bytes, 평균 응답 500ms, 최대 30 TPS
- **일일 트래픽 한도: 오퍼레이션당 1,000건** (개발계정). 0장 참조.
  - 실측 기준 필요 호출량: 키워드 13개 × 1회 = **일 13건**. 한도 대비 1.3%로 여유가 크다.
  - 365일 백필도 키워드당 1~2페이지(`numOfRows=999`)면 끝나므로 **1회성 26건 내외**.
- 사전규격은 활용신청 승인됨. **발주계획은 미신청 상태**(0장 참조)
- `type=json` 지정 시에도 일부 조달청 API가 XML을 반환하는 사례가 있으므로 Content-Type 확인 후 파싱 분기 권장
- 파라미터 이름 충돌 주의: 발주계획의 `orderInsttNm`(발주기관)과 사전규격의 `ntceInsttNm`(공고기관)은 의미가 다르다. 사전규격 응답에서는 공고기관이 `orderInsttNm`으로 내려온다.

---

## 7. 예제 요청

### 발주계획 — 공사, 사업명 검색

```
GET https://apis.data.go.kr/1230000/ao/OrderPlanSttusService/getOrderPlanSttusListCnstwkPPSSrch
  ?ServiceKey={KEY}
  &type=json
  &pageNo=1
  &numOfRows=10
  &orderBgnYm=202601
  &orderEndYm=202612
  &inqryBgnDt=202601010000
  &inqryEndDt=202612312359
  &bizNm=생태복원사업
```

### 사전규격 — 물품, 품명 검색

```
GET https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThngPPSSrch
  ?ServiceKey={KEY}
  &type=json
  &pageNo=1
  &numOfRows=10
  &inqryDiv=1
  &inqryBgnDt=202601010000
  &inqryEndDt=202612312359
  &prdctClsfcNoNm=유지관리
```

### 사전규격 — 등록번호 단건 조회 (공식 문서 예제)

```
GET https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThngPPSSrch
  ?ServiceKey={KEY}
  &inqryDiv=2
  &bfSpecRgstNo=347523
  &pageNo=1
  &numOfRows=10
```
