import { SUPPLIER_SKU_MEDIA, type SupplierSkuMedia } from "./yupoo-sku-media";
import { PAGE_1_DRAFTS } from "./catalog-page-1";
import { ALL_PAGES_VERIFIED_DRAFTS } from "./catalog-pages-1-19";

export type ImportedSkuDraft = {
  sku: string;
  brand: string;
  nameKo: string;
  nameEn: string;
  category?: "신발" | "가방" | "의류";
  productType?: "shoes" | "bags" | "clothing" | "accessories";
  subcategory: string;
  officialColor?: string;
  gender?: string;
  material?: string;
  sizeGuide?: string;
  releaseDate?: string;
  countryOfOrigin?: string;
  description?: string;
  detailContent?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  sourceUrl?: string;
  sourceUrls?: Array<{ url: string; label: string }>;
  sourceNote?: string;
};

const RAW_SKUS = `
001A-W-HORIZON
ZXSHM191305O
ZXSHM307911P
10001-001
10001-160
10001-1FT
10001-2Y2
10001-410
1011B873-401
1011B873-750
1011B875-100
1011B875-101
1011B875-400
1011B875-751
1012B676-500
1012B879-100
1013A162-300
1013A162-600
1013A176-100
1013A177-001
1013A177-100
1013A177-400
1013A177-750
1013A177-800
1016501-BLK
1016501-CHE
1107949-BLK
1107949-CHE
1107949-PEW
1130554-BLK
1130554-CHE
1144096-BBLC
1144096-CTON
1144096-CWTC
1144096-DNT
1144096-SBRC
1147650-RAWW
1147650-SCCP
1147650-STLLT
1147670-DLY
1147670-INM
1147670-QZT
1157050-BONE
1157050-RBBR
1157050-SLFR
1158351-BHTP
1162011-CWG
1162011-CYLT
1162011-DNP
1162011-WKB
1162012-OSG
1162012-SDSTS
1162535-SSSV
1168450-BCKT
1168450-CWTM
1168450-LHC
1168450-LTM
1168450-SLWS
1168971-BWHT
1168971-WBLC
1182A677-700
1182A678-200
1182A708-700
1183A360-131
1183A360-132
1183A360-205
1183A707-106
1183C123-002
1183C123-021
1183C123-200
1183C123-202
1183C123-250
1183C123-251
1183C123-252
1183C123-254
1183C123-400
1183C529-100
1183C529-101
1183C529-200
1203A537-024
1203A537-300
1203A704-020
1203A740-750
1203A903-001
1203A903-100
1203A951-020
2005-2026
211944-8C1
211994-001
211994-0WV
212478-2LD
212811-0LD
212811-1NK
212811-2MD
212811-5DK
314254-107
314254-702
398846-01
398846-02
398846-04
398846-09
398846-31
398847-01
MD30330108
MD30330485
MD30332421
MF30660553
MF30664606
MF30664607
MF30664611
3SN272ZAY-H000
3SN272ZIJ-H068
3SN272ZIJ-H580
3SN272ZIJ-H890
3SN272ZIR-H965
3SN272ZPR-H969
3SN272ZSB-H000
3SN272ZTY-H868
3SN272ZWC-H968
WD30310436
WD30310554
WD30310663
WD30312424
WD30313505
WG10030664
WG10914921
401603-01
401603-02
401603-03
404390-01
404391-01
408202-101
408848-01
500877-DRW00-9522
500878-DRW00-9522
546163-0YI20-9581
546163-0YI20-9582
619891-99WF0-4370
620185-99WF0-4371
626969-030
705331-330
719864-010
719864-600
XL11010
XL11090
XL11210
XL19000
XL49191
XL59110
819139-205
838919-9SFR0-2546
A01FW702-BLUE
A01FW702-GRAY
A01FW702-GREEN
A01FW702-NATURAL
A01FW702-PINK
A01FW702-PURPLE
A01FW702-WHITE
A02FW704-WHITE
A04FW729-NATURAL
A05FW702-GRAY
A0685U-NUTARAL
A0685U-PINKWHITE
A0685U-WHITE
A0891U-BK
A0891U-WT
A09FW721-GRAY
A09FW721-KHAKI
A09FW721-WHITE
A11FW702-BLACK
A11FW702-BLKBLK
A11FW702-BORDEAUX
A11FW702-GREEN
A11FW702-RED
A11FW702-WHITE
A12FW707-BLACK
A12FW707-WHITE
A14FW741-BLACK
A14FW741-WHITE
FW723
AQ3559-800
CD5463-100
CD5463-102
CD5463-200
CI1184-617
CU1110-010
D1GH2229-1
D1GH2229-2
D1GH2229-3
GH222910
D1GH2230-02
D1GH2230-06
GH223501
GH223502
GH223505
GH223506
GH223513
GH223515
GH223518
GH223521
GH223523
GH240812
GH241901
GH241902
GH241903
GH241905
GH241906
GH241907
GH243601
DB0732-200
DH2987-001
DH2987-100
DH2987-101
DH2987-117
DH6927-061
DH6927-111
DH6927-140
DH6927-161
DH7138-006
DV3742-021
FD0320-133
FD0736-010
FD0736-011
FD0736-113
FD0736-602
FQ7928-001
FQ8138-001
FQ8138-002
FV5029-006
FZ0624-100
GCOMS590-A7
GCOWS590-W77
GMF00101-F000321-80203
GMF00102-F000311-10270
GMF00922-F007392-40532
GT-2160
GWF00102-F000317-10273
GWF00102-F000959-80724
GWF00117
GWF00117-F003773-11325
GWF00117-F007472-12274
GWF00922
GWF00922-F007383-25741
GWF00922-F007982-90100
HF1068-133
HJ4031-200
HV8150-404
HV8547-002
HV8547-200
HV9272-001
HV9272-002
HV9272-100
HV9272-401
HV9272-700
IH4000
IH4001
IH4532
JBM231-M19-C1
JQ4445
JR1251
JR1269
JS2579
KCK177CVA-S06W
KCK211OBE-S33G
KCK304CVE-S03W
KCK414SUH-S20G
KCK414TRL-S49G
KCK414TRL-S59K
KCK414TRM-S19W
KCK414TXX-S15U
KH6225
KH7638
KH8439
KI1465
KI1914
KI1916
KI3025
KI3027
KI3467
KI4392
KI4780
KI7354
KJ7306
KK0289
KK0290
L929282X15-2150
L929282X15-5888
L929282X31-2540
L929282X31-9100
LHNRD-S5631Z-BIA
LHNRD-S5631Z-OLG
LHNRD-S5631Z-VSN
M929282X15-3088
M929282X15-3089
M929282X15-5887
M929282X38-1100
M929282X38-2013
M929282X38-2999
M929282X38-4227
M929282X38-4280
M929282X38-5150
M929282X38-6615
M929282X38-6616
M929282X38-9100
M929282X41-8627
M929282X41-8635
M929282X41-8644
NORDA001-M-LEMON
NORDA001-M-MARS
NORDA001-M-PARHELION
NORDA001-M-RHODOTUS
NORDA001-M-WTFT
NORDA001A-M-LOAM
NORDA001GS-M-BLK
NORDA001GS-W-GRYO
NORDA001RC-M-HEATHERGREY
NORDA001RZ-M-VERMILLION
NORDA002-M-ALPINE-WHT
NORDA002-M-AMARANTH
NORDA002-M-BLK
NORDA002-M-CINDER
NORDA002-M-OAK
NORDA002-M-SAGE
NORDA002-M-SAND
NORDA002-M-STLTHBLK
WS0236P1895H6851
WS0236P1897900
WS0109P1895T1016
XT-MM6
`;

const COLOR_LABELS: Record<string, string> = {
  BLACK: "블랙", BLK: "블랙", BK: "블랙", WBLC: "화이트/블랙", BWHT: "블랙/화이트",
  WHITE: "화이트", WHT: "화이트", WT: "화이트", BLUE: "블루", GRAY: "그레이",
  GREY: "그레이", GREEN: "그린", PINK: "핑크", PURPLE: "퍼플", RED: "레드",
  NATURAL: "내추럴", NUTARAL: "내추럴(원문 오타 확인 필요)", KHAKI: "카키",
  BORDEAUX: "보르도", BONE: "본", CHE: "체스트넛", BLKBLK: "블랙/블랙",
  PINKWHITE: "핑크/화이트", ALPINE: "알파인 화이트", CINDER: "신더", OAK: "오크",
  SAGE: "세이지", SAND: "샌드", LEMON: "레몬", MARS: "마스", LOAM: "로암",
  VERMILLION: "버밀리언", HEATHERGREY: "헤더 그레이",
};

function suffixColor(sku: string) {
  const normalized = sku.toUpperCase();
  const parts = normalized.split("-");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const direct = COLOR_LABELS[parts[index]];
    if (direct) return direct;
  }
  if (normalized.endsWith("-ALPINE-WHT")) return "알파인 화이트";
  return "";
}

function draft(
  sku: string,
  brand: string,
  modelKo: string,
  modelEn = modelKo,
  extra: Partial<ImportedSkuDraft> = {},
): ImportedSkuDraft {
  const officialColor = extra.officialColor ?? suffixColor(sku);
  return {
    sku,
    brand,
    nameKo: `${brand} ${modelKo}${officialColor ? ` ${officialColor}` : ""}`,
    nameEn: `${brand} ${modelEn}${officialColor ? ` ${officialColor}` : ""}`,
    subcategory: "스니커즈",
    officialColor,
    ...extra,
  };
}

function inferSkuDraft(sku: string): ImportedSkuDraft {
  const upper = sku.toUpperCase();

  if (sku === "001A-W-HORIZON") return draft(sku, "NORDA", "001A 여성 트레일 러닝화", "001A Women's Trail Running Shoes", {
    gender: "여성용",
    subcategory: "트레일 러닝화",
    officialColor: "호라이즌",
    nameEn: "norda 001A Women's Trail Running Shoes - Horizon",
    material: "바이오 기반 Dyneema® 갑피·Arnitel® TPEE 미드솔·Vibram® Litebase/Megagrip 아웃솔",
    description: "초장거리 트레일을 위해 최적화된 여성용 NORDA 001A입니다. 가볍고 내마모성이 뛰어난 Dyneema® 갑피, 반응성이 좋은 Arnitel® TPEE 미드솔, 접지력을 높인 Vibram® Litebase/Megagrip 아웃솔을 적용했습니다.",
    imageUrl: "https://cdn.shopify.com/s/files/1/0650/1089/3019/files/001A-HorizonLeadCropped_1d19d9e1-e360-40a6-8828-591b2071891d.png?v=1771547397",
    sourceUrls: [
      { url: "https://nordarun.com/products/001a-w-white-gum", label: "NORDA 공식 001A 여성 상품정보·호라이즌 옵션 확인" },
      { url: "https://www.runasyouare.com/products/norda-001a-womens-001a-w-horizon", label: "Run As You Are 호라이즌 품번 확인" },
      { url: "https://havnstore.com/products/norda-001a-w-horizon", label: "HAVN 호라이즌 색상·상품사진 교차 확인" },
    ],
    sourceNote: "NORDA 공식 사양과 품번 일치 판매처로 교차 확인",
  });
  if (upper.startsWith("ZXSHM191305")) return draft(sku, "A BATHING APE", "BAPE STA #3 M1", "BAPE STA #3 M1", {
    gender: "남성용",
    officialColor: "색상 옵션형(블랙·블루·오렌지)",
    nameEn: "A BATHING APE BAPE STA #3 M1 (Color Options)",
    material: "소가죽 100%",
    sizeGuide: "US 7~12 (공식 상품 페이지 기준)",
    description: "A BATHING APE의 남성용 BAPE STA #3 M1 로우탑 스니커즈입니다. 소가죽 100% 갑피에 STA 로고 디테일과 레이스업 여밈을 적용했습니다. 품번 끝의 색상 코드를 확인한 뒤 블랙·블루·오렌지 중 실제 색상을 선택해 주세요.",
    imageUrl: "https://int.bape.com/cdn/shop/files/0ZXSHM191305OBKX-pdp-1.jpg?v=1745906514",
    sourceUrls: [
      { url: "https://int.bape.com/products/bape-men-low-sneakers-bape-sta-3-m1-0zxshm191305o", label: "BAPE 공식 품번·소재 확인" },
      { url: "https://asphalt-nyc.com/products/0zxshm191305o-orx-ape-sta-3-m1", label: "Asphalt NYC 품번·상품사진 교차 확인" },
      { url: "https://kream.co.kr/social/products/513141", label: "KREAM 블랙 색상·모델번호 교차 확인" },
    ],
    sourceNote: "BAPE 공식 상품 페이지에서 입력 품번 그대로 확인",
  });
  if (upper.startsWith("ZXSHM307911")) return draft(sku, "A BATHING APE", "BAPE STA OS #2 M2", "BAPE STA OS #2 M2", {
    gender: "남성용",
    officialColor: "색상 옵션형(블랙·레드·화이트)",
    nameEn: "A BATHING APE BAPE STA OS #2 M2 (Color Options)",
    material: "소가죽 80%·TPU 20%",
    sizeGuide: "US 7~13 (공식 상품 페이지 기준)",
    description: "A BATHING APE의 남성용 BAPE STA OS #2 M2 로우탑 스니커즈입니다. 소가죽 80%와 TPU 20%로 구성된 갑피에 STA 로고 디테일과 레이스업 여밈을 적용했습니다. 품번 끝의 색상 코드를 확인한 뒤 블랙·레드·화이트 중 실제 색상을 선택해 주세요.",
    imageUrl: "https://int.bape.com/cdn/shop/files/0ZXSHM307911PBKX-pdp-1.jpg?v=1768561341",
    sourceUrls: [
      { url: "https://int.bape.com/products/bape-men-low-sneakers-bape-sta-os-2-m2-0zxshm307911p", label: "BAPE 공식 품번·소재 확인" },
      { url: "https://kream.co.kr/products/762556", label: "KREAM 블랙 색상·모델번호 교차 확인" },
      { url: "https://kream.co.kr/products/762558", label: "KREAM 화이트 색상·모델번호 교차 확인" },
    ],
    sourceNote: "BAPE 공식 상품 페이지에서 입력 품번 그대로 확인",
  });
  if (upper.startsWith("ZXSHM")) return draft(sku, "A BATHING APE", "BAPESTA 상품정보 확인 필요", "BAPESTA - Review Required", { sourceNote: "라벨·공급처 코드 가능성 있음" });
  if (upper === "10001-001") return draft(sku, "CROCS", "클래식 클로그", "Classic Clog", {
    subcategory: "클로그", gender: "남녀공용", officialColor: "블랙", material: "Croslite™",
    nameEn: "Crocs Classic Clog - Black",
    description: "가볍고 물에 강한 Croslite™ 소재의 남녀공용 크록스 클래식 클로그입니다. 통풍구, 회전식 힐 스트랩, 세척과 건조가 쉬운 구조를 갖췄으며 Jibbitz™ 참으로 꾸밀 수 있습니다.",
    imageUrl: "https://www.crocs.com.vn/cdn/shop/files/Giay-Clog-Unisex-Crocs-Classic-Black-10001-001_2.jpg?v=1694772885",
    sourceUrls: [
      { url: "https://www.crocs.com/p/classic-clog/10001.html", label: "Crocs 공식 클래식 클로그 사양" },
      { url: "https://www.crocs.com.vn/en/products/giay-clog-classic-10001-001", label: "블랙 품번 확인" },
      { url: "https://www.shiekh.com/crocs-classic-clog-black.html", label: "Shiekh 블랙 품번·상품사진 교차 확인" },
    ],
  });
  if (upper === "10001-160") return draft(sku, "CROCS", "클래식 클로그", "Classic Clog", {
    subcategory: "클로그", gender: "남녀공용", officialColor: "스터코", material: "Croslite™",
    nameEn: "Crocs Classic Clog - Stucco",
    description: "부드러운 스터코 색상의 남녀공용 크록스 클래식 클로그입니다. 가볍고 물에 강한 Croslite™ 소재, 통풍구, 회전식 힐 스트랩을 적용했으며 세척과 건조가 쉽습니다.",
    imageUrl: "https://cdn.afew-store.com/assets/38/385773/600/crocs-classic-clog-stucco-10001-160-footwear%20%3E%20sandals%20%26%20slides-packshots-0.jpg",
    sourceUrls: [
      { url: "https://www.crocs.com/p/classic-clog/10001.html", label: "Crocs 공식 클래식 클로그 사양" },
      { url: "https://en.afew-store.com/products/crocs-classic-clog-stucco", label: "스터코 품번 확인" },
      { url: "https://www.shoepalace.com/products/crocs-10001-160-classic-clog-mens-sandals-stucco-white", label: "Shoe Palace 스터코 색상·상품사진 교차 확인" },
    ],
  });
  if (upper === "10001-1FT") return draft(sku, "CROCS", "클래식 클로그", "Classic Clog", {
    subcategory: "클로그", gender: "남녀공용", officialColor: "애트모스피어", material: "Croslite™",
    nameEn: "Crocs Classic Clog - Atmosphere",
    description: "은은한 애트모스피어 색상의 남녀공용 크록스 클래식 클로그입니다. 가볍고 물에 강한 Croslite™ 소재, 통풍구, 회전식 힐 스트랩을 적용했으며 Jibbitz™ 참으로 꾸밀 수 있습니다.",
    imageUrl: "https://www.crocs.com.vn/cdn/shop/products/10001-1FT-1.jpg?v=1673001557",
    sourceUrls: [
      { url: "https://www.crocs.com.vn/en/products/giay-clog-unisex-crocs-classic-10001-1ft-atmosphere", label: "Crocs 공식 지역몰 품번·색상 확인" },
      { url: "https://www.astepaheadfootwear.com/crocs-classic-clog-10001-1ft.html", label: "A Step Ahead 품번·상품사진 교차 확인" },
      { url: "https://www.peltzshoes.com/products/womens-crocs-10001-1ft", label: "Peltz Shoes 애트모스피어 색상 교차 확인" },
    ],
  });
  if (upper === "10001-2Y2") return draft(sku, "CROCS", "클래식 클로그", "Classic Clog", {
    subcategory: "클로그", gender: "남녀공용", officialColor: "본", material: "Croslite™",
    nameEn: "Crocs Classic Clog - Bone",
    description: "따뜻한 본 색상의 남녀공용 크록스 클래식 클로그입니다. 가볍고 물에 강한 Croslite™ 소재, 통풍구, 회전식 힐 스트랩을 적용했으며 세척과 건조가 쉽습니다.",
    imageUrl: "https://www.crocs.com.vn/cdn/shop/products/10001-2Y2-1.jpg?v=1664259805",
    sourceUrls: [
      { url: "https://www.crocs.com.vn/en/products/giay-clog-unisex-crocs-classic-10001-2y2-bone", label: "Crocs 공식 지역몰 품번·색상 확인" },
      { url: "https://www.shiekh.com/crocs-classic-clog-bone-1.html", label: "Shiekh 본 색상·상품사진 교차 확인" },
      { url: "https://en-sa.crocsgulf.com/classic-clogs-10001-2y2-bone.html", label: "Crocs Gulf 품번·색상 교차 확인" },
    ],
  });
  if (upper === "10001-410") return draft(sku, "CROCS", "클래식 클로그", "Classic Clog", {
    subcategory: "클로그", gender: "남녀공용", officialColor: "네이비", material: "Croslite™",
    nameEn: "Crocs Classic Clog - Navy",
    description: "네이비 색상의 남녀공용 크록스 클래식 클로그입니다. 가볍고 물에 강한 Croslite™ 소재, 통풍구, 회전식 힐 스트랩을 적용했으며 Jibbitz™ 참으로 꾸밀 수 있습니다.",
    imageUrl: "https://www.crocs.com.vn/cdn/shop/products/10001-410-1.jpg?v=1631891390",
    sourceUrls: [
      { url: "https://www.crocs.com.vn/en/products/giay-clog-unisex-crocs-10001-410", label: "Crocs 공식 지역몰 네이비 품번 확인" },
      { url: "https://www.crocs.com/p/classic-clog/10001.html", label: "Crocs 공식 클래식 클로그 네이비 옵션·사양 확인" },
    ],
  });
  if (upper.startsWith("10001-")) return draft(sku, "CROCS", "클래식 클로그", "Classic Clog", { subcategory: "클로그" });

  if (upper === "1011B873-401") return draft(sku, "ASICS", "매직 스피드 4 와이드", "MAGIC SPEED 4 WIDE", {
    gender: "남성용", subcategory: "로드 러닝화", officialColor: "수딩 씨/블랙", material: "엔지니어드 메시 갑피·FF TURBO™/FF BLAST™ PLUS 쿠셔닝·카본 플레이트·ASICSGRIP™ 아웃솔",
    nameEn: "ASICS MAGIC SPEED 4 WIDE - Soothing Sea/Black",
    description: "레이스와 템포 러닝을 위한 남성용 ASICS MAGIC SPEED 4 WIDE입니다. 통기성 좋은 엔지니어드 메시 갑피, 추진력과 안정성을 돕는 풀렝스 카본 플레이트, 반응성이 높은 FF TURBO™ 쿠셔닝을 적용한 와이드 핏 모델입니다.",
    imageUrl: "/catalog/batch-1/1011B873-401.png",
    sourceUrls: [
      { url: "https://www.asics.com/ph/en-ph/magic-speed-4-wide/p/1011B873-401.html", label: "ASICS 공식 품번·색상·기술 사양 확인" },
      { url: "https://snkrdunk.com/en/sneakers/1011B873-401", label: "SNKRDUNK 품번·색상·상품사진 교차 확인" },
      { url: "https://irunsg.com/products/asics-mens-magicspeed4-soothingsea-1011b873-401", label: "iRun Singapore 품번·색상 교차 확인" },
    ],
    sourceNote: "ASICS 공식 상품 페이지에서 품번·색상·기술 사양 확인",
  });
  if (upper === "1011B873-750") return draft(sku, "ASICS", "매직 스피드 4 와이드", "MAGIC SPEED 4 WIDE", {
    gender: "남성용", subcategory: "로드 러닝화", officialColor: "세이프티 옐로/블랙", material: "엔지니어드 메시 갑피·FF TURBO™/FF BLAST™ PLUS 쿠셔닝·카본 플레이트·ASICSGRIP™ 아웃솔",
    nameEn: "ASICS MAGIC SPEED 4 WIDE - Safety Yellow/Black",
    releaseDate: "2024-07-05",
    description: "세이프티 옐로와 블랙을 조합한 남성용 ASICS MAGIC SPEED 4 WIDE입니다. 통기성 좋은 엔지니어드 메시 갑피, 추진력과 안정성을 돕는 풀렝스 카본 플레이트, 반응성이 높은 FF TURBO™ 쿠셔닝을 적용한 와이드 핏 러닝화입니다.",
    imageUrl: "/catalog/batch-1/1011B873-750.png",
    sourceUrls: [
      { url: "https://www.asics.com/ph/en-ph/magic-speed-4-wide/p/1011B873-401.html", label: "ASICS 공식 MAGIC SPEED 4 WIDE 사양" },
      { url: "https://www.goat.com/sneakers/magic-speed-4-wide-safety-yellow-1011b873-750", label: "세이프티 옐로 품번·출시일 확인" },
      { url: "https://www.kickscrew.com/products/asics-magic-speed-4-wide-safety-yellow-1011b873-750", label: "KICKS CREW 품번·상품사진 교차 확인" },
      { url: "https://www.flightclub.com/magic-speed-4-wide-safety-yellow-1011b873-750", label: "Flight Club 색상·품번 교차 확인" },
    ],
    sourceNote: "공식 모델 사양과 품번별 색상 정보를 교차 확인",
  });
  if (upper.startsWith("1011B873")) return draft(sku, "ASICS", "매직 스피드 4 와이드", "Magic Speed 4 Wide", { gender: "남성용", subcategory: "러닝화", sourceUrl: "https://www.asics.com/ph/en-ph/magic-speed-4-wide/p/1011B873-401.html" });
  if (upper.startsWith("1011B875")) return draft(sku, "ASICS", "매직 스피드 4", "Magic Speed 4", { gender: "남성용", subcategory: "러닝화" });
  if (upper.startsWith("1012B676")) return draft(sku, "ASICS", "여성 매직 스피드 4", "Women's Magic Speed 4", { gender: "여성용", subcategory: "러닝화" });
  if (upper.startsWith("1013A177")) return draft(sku, "ASICS", "슈퍼블라스트 3", "Superblast 3", { gender: "남녀공용", subcategory: "러닝화", sourceUrl: "https://www.asics.com/gb/en-gb/superblast--3/p/1013A177-001.html" });
  if (/^101[123][A-Z]/.test(upper)) return draft(sku, "ASICS", `${sku.split("-")[0]} 러닝화`, `${sku.split("-")[0]} Running Shoes`, { subcategory: "러닝화", sourceNote: "세부 모델명 확인 필요" });
  if (/^118[23][AC]/.test(upper)) return draft(sku, "ONITSUKA TIGER", `${sku.split("-")[0]} 스니커즈`, `${sku.split("-")[0]} Sneakers`, { sourceNote: "세부 모델명 확인 필요" });
  if (upper.startsWith("1203A903")) return draft(sku, "ASICS", "GT-2160 브리즈", "GT-2160 Breeze", { gender: "남녀공용", sourceUrl: "https://me.asics.com/en-ae/gt-2160-breeze-1203a903-001.html" });
  if (upper === "GT-2160") return draft(sku, "ASICS", "GT-2160", "GT-2160", { gender: "남녀공용", sourceNote: "모델명만 제공됨. 최종 등록 전 색상별 공식 품번 확인 필요" });
  if (upper.startsWith("1203A")) return draft(sku, "ASICS", `${sku.split("-")[0]} 스포츠스타일`, `${sku.split("-")[0]} SportStyle`, { sourceNote: "세부 모델명 확인 필요" });

  const uggModels: Record<string, string> = {
    "1016501": "미니 베일리 보우 II", "1107949": "클래식 미니 II", "1130554": "타스만",
    "1144096": "타스만 웨더 하이브리드", "1158351": "타스만 웨더 하이브리드",
  };
  const uggBase = upper.split("-")[0];
  if (uggModels[uggBase]) return draft(sku, "UGG", uggModels[uggBase], uggModels[uggBase], { gender: "여성용", subcategory: /타스만|타즈|슬립온|로우멜|슈즈/.test(uggModels[uggBase]) ? "슬립온" : "부츠", material: "스웨이드·양털 계열(세부 확인 필요)" });

  const hokaModels: Record<string, { ko: string; en: string; gender: string; subcategory: string; material: string; sourceUrl: string }> = {
    "1147650": { ko: "남성 호파라 2", en: "Men's Hopara 2", gender: "남성용", subcategory: "하이킹 샌들", material: "재생 니트·CORDURA® 메시·사탕수수 기반 EVA·러버 아웃솔", sourceUrl: "https://www.hoka.com/en/us/mens-trail-hiking-shoes/hopara-2/1147650.html" },
    "1147670": { ko: "여성 호파라 2", en: "Women's Hopara 2", gender: "여성용", subcategory: "하이킹 샌들", material: "재생 니트·CORDURA® 메시·사탕수수 기반 EVA·러버 아웃솔", sourceUrl: "https://www.hoka.com/en/us/womens-trail-hiking-shoes/hopara-2/1147670.html" },
    "1157050": { ko: "SATISFY 마파테 스피드 4 라이트", en: "Mafate Speed 4 Lite STSFY", gender: "남녀공용", subcategory: "트레일 러닝화", material: "경량 TPU 메시·립스톱 나일론·Vibram® Megagrip Litebase", sourceUrl: "https://www.hoka.com/en/us/all-gender-footwear/mafate-speed-4-lite-stsfy/1157050.html" },
    "1162011": { ko: "남성 본디 9", en: "Men's Bondi 9", gender: "남성용", subcategory: "로드 러닝화", material: "엔지니어드 니트 메시·슈퍼크리티컬 EVA·Durabrasion 러버", sourceUrl: "https://www.hoka.com/en/us/mens-everyday-running-shoes/bondi-9/1162011.html" },
    "1162012": { ko: "여성 본디 9", en: "Women's Bondi 9", gender: "여성용", subcategory: "로드 러닝화", material: "엔지니어드 니트 메시·프리미엄 폼·Durabrasion 러버", sourceUrl: "https://www.hoka.com/en/us/womens-everyday-running-shoes/bondi-9/1162012.html" },
    "1162535": { ko: "남성 호파라 2 에어리노", en: "Men's Hopara 2 Aerino", gender: "남성용", subcategory: "하이킹 샌들", material: "메리노울 혼방 니트·CORDURA® rPET·사탕수수 기반 EVA", sourceUrl: "https://www.hoka.com/en/us/mens-trail-hiking-shoes/hopara-2-aerino/1162535.html" },
    "1168450": { ko: "마파테 스피드 4 라이트", en: "Mafate Speed 4 Lite", gender: "남녀공용", subcategory: "트레일 러닝화", material: "반투명 경량 갑피·립스톱 나일론·Vibram® Megagrip Litebase", sourceUrl: "https://www.hoka.com/en/us/all-gender-footwear/mafate-speed-4-lite/1168450.html" },
    "1168971": { ko: "스텔스테크 마파테 스피드 4 라이트", en: "Stealth/Tech Mafate Speed 4 Lite", gender: "남녀공용", subcategory: "트레일 러닝화", material: "반투명 립스톱 갑피·ProFly™+ 미드솔·Vibram® Megagrip", sourceUrl: "https://www.hoka.com/en/us/all-gender-footwear/stealth%2Ftech-mafate-speed-4-lite/1168971.html" },
  };
  const hokaBase = hokaModels[uggBase];
  if (hokaBase) return draft(sku, "HOKA", hokaBase.ko, hokaBase.en, {
    gender: hokaBase.gender,
    subcategory: hokaBase.subcategory,
    material: hokaBase.material,
    sourceUrl: hokaBase.sourceUrl,
    description: `${hokaBase.ko}는 HOKA 공식 품번 ${uggBase} 모델입니다. 공급처 카탈로그에 등록된 ${sku} 색상 사진을 기준으로 구성했으며, 실제 구매 전 사이즈와 색상 옵션을 확인해 주세요.`,
  });

  if (/^(211944|211994|212478|212811)-/.test(upper)) return draft(sku, "CROCS", `${upper.split("-")[0]} 클로그`, `${upper.split("-")[0]} Clog`, { subcategory: "클로그", sourceNote: "세부 모델명 확인 필요" });
  if (/^(314254|626969|705331|719864|819139)-/.test(upper)) return draft(sku, "NIKE", `${upper.split("-")[0]} 스니커즈`, `${upper.split("-")[0]} Sneakers`, { sourceNote: "세부 모델명 확인 필요" });
  if (/^(398846|398847|401603|404390|404391|408202|408848)-/.test(upper)) return draft(sku, "PUMA", `${upper.split("-")[0]} 스니커즈`, `${upper.split("-")[0]} Sneakers`, { sourceNote: "세부 모델명 확인 필요" });

  if (/^[MW][DFG]?[0-9]{8}$/.test(upper) || /^(MD|MF|WD|WG)/.test(upper)) return draft(sku, "ON × LOEWE", "클라우드틸트 계열", "Cloudtilt Series", { subcategory: "러닝화", sourceNote: "앞자리 3이 생략된 공급처 코드 가능성 있음" });
  if (upper.startsWith("3SN272")) return draft(sku, "DIOR", "B27 로우탑", "B27 Low-Top", { gender: "남성용", material: "가죽·패브릭 계열", sourceUrl: sku === "3SN272ZAY-H000" ? "https://www.goat.com/sneakers/dior-b27-low-dior-gravity-white-3sn272zay-h000" : undefined });
  if (/^(500877|500878|546163|619891|620185|838919)-/.test(upper)) return draft(sku, "GUCCI", upper.startsWith("500877") ? "라이톤 빈티지 로고" : "럭셔리 스니커즈", upper.startsWith("500877") ? "Rhyton Vintage Logo" : "Luxury Sneakers", { material: "가죽 계열(세부 확인 필요)", sourceUrl: upper.startsWith("500877") ? "https://www.gucci.com/us/en/pr/men/shoes-for-men/sneakers-for-men/mens-rhyton-sneaker-with-gucci-logo-p-500877DRW009522" : undefined });

  if (/^A(?:0|1)[0-9A-Z]/.test(upper) || upper === "FW723") {
    const model = upper.startsWith("A01FW702") ? "피터슨 OG 솔 캔버스 로우" : "OG 솔 스니커즈";
    return draft(sku, "MAISON MIHARA YASUHIRO", model, upper.startsWith("A01FW702") ? "Peterson OG Sole Canvas Low" : "OG Sole Sneakers", { material: "캔버스·고무 계열(세부 확인 필요)", sourceUrl: upper.startsWith("A01FW702") ? "https://www.kickscrew.com/products/maison-mihara-yasuhiro-peterson-og-sole-canvas-low-blue-a01fw702-blue" : undefined });
  }

  if (/^(AQ|CD|CI|CU|DB|DH|DV|FD|FQ|FV|FZ|HF|HJ|HV)[A-Z0-9]+-/.test(upper)) {
    if (upper === "HV8547-002") return draft(sku, "NIKE × JACQUEMUS", "여성 문 슈 SP 소프트 펄", "Women's Moon Shoe SP Soft Pearl", { gender: "여성용", officialColor: "소프트 펄/세일", material: "나일론·천연가죽", sourceUrl: "https://www.nike.com/launch/t/womens-moon-shoe-jacquemus-soft-pearl-and-sail" });
    if (upper.startsWith("HV8547-")) return draft(sku, "NIKE × JACQUEMUS", "여성 문 슈 SP", "Women's Moon Shoe SP", { gender: "여성용" });
    return draft(sku, "NIKE", `${upper.split("-")[0]} 스니커즈`, `${upper.split("-")[0]} Sneakers`, { sourceNote: "세부 모델명 확인 필요" });
  }

  if (/^(D1GH|GH)[0-9]/.test(upper)) return draft(sku, "MIZUNO", `${upper.replace("D1", "")} 스니커즈`, `${upper.replace("D1", "")} Sneakers`, { sourceNote: "세부 모델명 확인 필요" });
  if (/^(GCOMS|GCOWS|GMF|GWF)/.test(upper)) return draft(sku, "GOLDEN GOOSE", "슈퍼스타 계열", "Super-Star Series", { material: "가죽 계열", sourceUrl: upper.startsWith("GCOMS590") ? "https://www.goat.com/sneakers/golden-goose-superstar-white-black-gcoms590-w55" : undefined });

  if (/^(IH|JQ|JR|JS|KH|KI|KJ|KK)[A-Z0-9]+$/.test(upper)) {
    if (upper === "IH4000") return draft(sku, "ADIDAS", "여성 도쿄 메리제인", "Women's Tokyo Mary Jane", { gender: "여성용", officialColor: "샌디 핑크/어스 스트라타/골드 메탈릭", sourceUrl: "https://www.adidas.com/us/tokyo-mary-jane-shoes/IH4000.html" });
    return draft(sku, "ADIDAS", `${upper} 스니커즈`, `${upper} Sneakers`, { sourceNote: "세부 모델명 확인 필요" });
  }

  if (upper === "JBM231-M19-C1") return draft(sku, "AIR JORDAN × EMINEM", "에어 조던 4 레트로 앙코르", "Air Jordan 4 Retro Encore", { gender: "남성용", officialColor: "블루/레드/블랙", sourceUrl: "https://stockx.com/jordan-4-retro-eminem-encore" });
  if (upper.startsWith("KCK")) return draft(sku, "DIOR", upper.startsWith("KCK177CVA") ? "여성 워크앤디올" : "여성 디올 스니커즈", upper.startsWith("KCK177CVA") ? "Women's Walk'N'Dior" : "Women's Dior Sneakers", { gender: "여성용", material: "캔버스·가죽 계열(세부 확인 필요)", sourceUrl: upper.startsWith("KCK177CVA") ? "https://www.goat.com/sneakers/dior-wmns-walk-n-dior-white-kck177cva-s06w" : undefined });

  if (/^[LM]929282X/.test(upper)) return draft(sku, "LOEWE × ON", "클라우드틸트", "Cloudtilt", { subcategory: "러닝화", gender: upper.startsWith("L") ? "여성용" : "남성용", sourceUrl: upper === "L929282X15-2150" ? "https://www.goat.com/sneakers/loewe-x-wmns-cloudtilt-sand-l929282x15-2150" : undefined });
  if (upper.startsWith("LHNRD-S5631Z")) return draft(sku, "ZEGNA × NORDA", "노다 001", "Norda 001", { subcategory: "트레일 러닝화", material: "Dyneema·Vibram", sourceUrl: "https://www.zegna.com/us-en/shoes/sneakers/product.zegna-x-norda-001-white-technical-fabric-sneakers.25709155/" });
  if (upper.startsWith("NORDA001")) return draft(sku, "NORDA", "001 트레일 러닝화", "001 Trail Running Shoes", { subcategory: "트레일 러닝화", material: "Dyneema·Vibram 계열" });
  if (upper.startsWith("NORDA002")) return draft(sku, "NORDA", "002 트레일 러닝화", "002 Trail Running Shoes", { subcategory: "트레일 러닝화", material: "Dyneema·Vibram 계열" });
  if (upper === "XT-MM6") return draft(sku, "SALOMON × MM6", "XT 협업 스니커즈", "XT Collaboration Sneakers", { subcategory: "트레일 스니커즈" });

  if (upper.startsWith("XL")) return draft(sku, "BALENCIAGA", "3XL 스니커즈", "3XL Sneakers", {
    gender: "남녀공용",
    material: "메시·폴리우레탄 계열",
    sourceUrl: "https://www.balenciaga.com/en-us/3xl-sneaker-black-734734W3XL11010.html",
  });
  if (/^WS0/.test(upper)) return draft(sku, "MAISON MARGIELA", "레플리카 스니커즈", "Replica Sneakers", {
    gender: upper.startsWith("WS0109") ? "여성용" : "남성용",
    material: "송아지가죽·스웨이드·러버",
    sourceUrl: upper.startsWith("WS0109")
      ? "https://www.maisonmargiela.com/en-us/replica-sneakers-S58WS0109P1895T1016.html"
      : "https://www.maisonmargiela.com/en-us/replica-sneakers-S57WS0236P1895H6851.html",
  });

  return draft(sku, "브랜드 확인 필요", `상품정보 확인 필요 · ${sku}`, `Review Required · ${sku}`, { sourceNote: "공급처 코드 또는 불완전 품번 가능성 있음" });
}

function supplierBrand(item: ImportedSkuDraft, supplier?: SupplierSkuMedia) {
  if (!supplier) return item.brand;
  if (supplier.supplierCategory === "Balenciaga") return "BALENCIAGA";
  if (supplier.supplierCategory === "Maison Margiela Calfskin") return "MAISON MARGIELA";
  if (supplier.supplierCategory === "alo") return "ALO YOGA";
  if (supplier.supplierCategory === "호카") return "HOKA";
  if (supplier.supplierCategory === "조던 4") return item.brand === "AIR JORDAN × EMINEM" ? item.brand : "AIR JORDAN";
  return item.brand;
}

function supplierName(item: ImportedSkuDraft, supplier?: SupplierSkuMedia) {
  if (!supplier) return item;
  if (supplier.supplierCategory === "Balenciaga") return { ko: `BALENCIAGA 3XL 스니커즈 ${item.officialColor || item.sku}`, en: `Balenciaga 3XL Sneakers ${item.officialColor || item.sku}` };
  if (supplier.supplierCategory === "Maison Margiela Calfskin") return { ko: `MAISON MARGIELA 레플리카 스니커즈 ${item.officialColor || item.sku}`, en: `Maison Margiela Replica Sneakers ${item.officialColor || item.sku}` };
  if (supplier.supplierCategory === "alo" && item.sku.startsWith("A0685U")) return { ko: `ALO YOGA 리커버리 모드 스니커즈 ${item.officialColor || item.sku}`, en: `ALO Yoga Recovery Mode Sneaker ${item.officialColor || item.sku}` };
  if (supplier.supplierCategory === "alo" && item.sku.startsWith("A0891U")) return { ko: `ALO YOGA 선셋 스니커즈 ${item.officialColor || item.sku}`, en: `ALO Yoga Sunset Sneaker ${item.officialColor || item.sku}` };
  if (supplier.supplierCategory === "조던 4" && item.brand !== "AIR JORDAN × EMINEM") return { ko: `AIR JORDAN 4 레트로 ${item.officialColor || item.sku}`, en: `Air Jordan 4 Retro ${item.officialColor || item.sku}` };
  return { ko: item.nameKo, en: item.nameEn };
}

function supplierAssetKey(sku: string) {
  return sku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function localSupplierMediaUrls(sku: string, supplier: SupplierSkuMedia) {
  const key = supplierAssetKey(sku);
  return supplier.mediaUrls.map((_, index) =>
    `/catalog/supplier/${key}/${String(index + 1).padStart(2, "0")}.webp`,
  );
}

function applySupplierCatalog(item: ImportedSkuDraft): ImportedSkuDraft {
  const supplier = SUPPLIER_SKU_MEDIA[item.sku];
  if (!supplier) return item;
  const names = supplierName(item, supplier);
  const isAlo = supplier.supplierCategory === "alo";
  const mediaUrls = localSupplierMediaUrls(item.sku, supplier);
  const sourceUrls = [
    ...(item.sourceUrls || (item.sourceUrl ? [{ url: item.sourceUrl, label: "공식·상품정보 확인 출처" }] : [])),
    { url: supplier.albumUrl, label: "스카이샵 품번·상품사진 확인" },
  ];
  const description = item.description || [
    `${names.ko}입니다. 품번 ${item.sku} 기준으로 등록했습니다.`,
    item.officialColor ? `등록 색상은 ${item.officialColor}입니다.` : "색상은 등록된 상품사진을 기준으로 확인할 수 있습니다.",
    "공급처 카탈로그에서 동일 품번의 상품사진을 대조해 등록했으며, 실제 구매 전 사이즈와 선택 옵션을 확인해 주세요.",
  ].join(" ");
  return {
    ...item,
    brand: supplierBrand(item, supplier),
    nameKo: names.ko,
    nameEn: names.en,
    ...(isAlo ? { gender: "남녀공용", material: "비건 레더·리커버리 폼·러버 아웃솔" } : {}),
    description,
    detailContent: item.detailContent || description,
    imageUrl: mediaUrls[0] || item.imageUrl,
    mediaUrls: mediaUrls.length ? mediaUrls : item.mediaUrls,
    sourceUrls,
    sourceUrl: undefined,
    sourceNote: `스카이샵 '${supplier.supplierTitle}' 단일 공급처 사진 임시자료 · 판매 전 최소 2개 외부 사이트에서 품번·색상·사진을 교차 확인하고 배경 없는 사진을 우선 선별해야 함`,
  };
}

const ORIGINAL_IMPORTED_SKU_DRAFTS: ImportedSkuDraft[] = Array.from(
  new Set(RAW_SKUS.split(/\s+/).map((value) => value.trim()).filter(Boolean)),
).map(inferSkuDraft).map(applySupplierCatalog);

const originalSkuKeys = new Set(ORIGINAL_IMPORTED_SKU_DRAFTS.map((item) => item.sku.toLowerCase()));
const pageOneSkuKeys = new Set(PAGE_1_DRAFTS.map((item) => item.sku.toLowerCase()));

export const IMPORTED_SKU_DRAFTS: ImportedSkuDraft[] = [
  ...ORIGINAL_IMPORTED_SKU_DRAFTS,
  ...PAGE_1_DRAFTS.filter((item) => !originalSkuKeys.has(item.sku.toLowerCase())),
  ...ALL_PAGES_VERIFIED_DRAFTS.filter((item) =>
    !originalSkuKeys.has(item.sku.toLowerCase()) && !pageOneSkuKeys.has(item.sku.toLowerCase()),
  ),
];

const VERIFIED_BATCH_1_DETAILS: Record<string, string> = {
  "001A-W-HORIZON": "초장거리 트레일 주행을 위해 설계된 여성용 NORDA 001A 호라이즌입니다. 바이오 기반 Dyneema® 원사를 사용한 일체형 갑피가 가벼운 착화감과 높은 내마모성을 제공하며, Arnitel® TPEE 미드솔이 장시간 주행에서 안정적인 반발력과 쿠셔닝을 유지합니다. Vibram® Litebase와 Megagrip 아웃솔은 젖은 노면과 불규칙한 지면에서 접지력을 높였고, 반사 디테일은 어두운 환경에서 시인성을 돕습니다. 트레일 러닝 특성상 평소 운동화보다 여유 있는 사이즈 선택을 권장합니다.",
  ZXSHM191305O: "A BATHING APE의 BAPE STA #3 M1 로우탑 스니커즈입니다. 소가죽 100% 갑피에 브랜드를 상징하는 STA 패널과 에이프 헤드 디테일을 배치하고, 쿠션감 있는 칼라와 레이스업 구조로 일상 착화의 안정감을 높였습니다. 클래식한 컵솔과 대비되는 블랙·화이트 배색이 스트리트 스타일과 캐주얼 룩에 자연스럽게 어울립니다. 현재 등록 사진은 공식 블랙 컬러 기준이며, 실제 주문 전 선택 색상과 사이즈를 반드시 확인해 주세요.",
  ZXSHM307911P: "A BATHING APE BAPE STA OS #2 M2는 볼륨감 있는 오버사이즈 STA 패널이 특징인 남성용 로우탑 스니커즈입니다. 소가죽 80%와 TPU 20%를 조합해 형태 유지력과 내구성을 높였으며, 패딩 처리된 발목 둘레와 레이스업 여밈이 편안한 착화를 돕습니다. 블랙과 화이트의 선명한 대비, 측면 로고와 힐 디테일이 브랜드 특유의 존재감을 완성합니다. 현재 등록 사진은 공식 블랙 컬러 기준이며 실제 주문 옵션을 확인해 주세요.",
  "10001-001": "크록스 클래식 클로그 블랙은 가볍고 물에 강한 Croslite™ 소재로 제작된 남녀공용 데일리 클로그입니다. 발등과 앞코의 통풍구가 공기 순환과 물 빠짐을 돕고, 회전식 힐 스트랩은 슬립온과 고정형 두 가지 방식으로 착용할 수 있습니다. 오염 시 물세척 후 자연 건조가 가능하며 Jibbitz™ 참을 활용해 개인 취향에 맞게 꾸밀 수 있습니다. 여유 있는 룸리 핏 제품으로 발볼과 착용 취향을 고려해 사이즈를 선택해 주세요.",
  "10001-160": "부드러운 뉴트럴 톤의 스터코 컬러로 구성한 크록스 클래식 클로그입니다. Croslite™ 일체형 구조가 가벼운 쿠셔닝과 물에 강한 실용성을 제공하며, 다수의 통풍구와 회전식 힐 스트랩으로 계절과 활동에 맞춰 편하게 착용할 수 있습니다. 다양한 각도에서 확인할 수 있도록 측면·정면·후면 상품사진을 함께 구성했습니다. 강한 열이나 직사광선에 장시간 노출하면 변형될 수 있으므로 서늘한 곳에서 자연 건조해 주세요.",
  "10001-1FT": "은은한 라이트 그레이 계열의 애트모스피어 컬러를 적용한 크록스 클래식 클로그입니다. 가볍고 유연한 Croslite™ 소재, 물 빠짐을 돕는 통풍구, 앞뒤로 움직이는 힐 스트랩을 갖춰 실내외에서 편하게 신을 수 있습니다. 넉넉한 발볼과 둥근 토박스가 발의 압박을 줄이며, 세척과 관리가 쉬워 데일리 슈즈로 활용하기 좋습니다. 실제 색상은 화면 설정과 조명에 따라 조금 다르게 보일 수 있습니다.",
  "10001-2Y2": "따뜻한 크림 베이지 계열의 본 컬러로 완성한 남녀공용 크록스 클래식 클로그입니다. Croslite™ 소재의 가벼운 쿠셔닝, 통풍과 배수를 돕는 발등 홀, 안정적인 착화를 위한 회전식 힐 스트랩을 적용했습니다. 맨발과 양말 착용 모두 편하며 Jibbitz™ 참으로 개성을 더할 수 있습니다. 물세척 후에는 고온 건조기 대신 통풍이 잘되는 그늘에서 자연 건조하는 것을 권장합니다.",
  "10001-410": "짙고 차분한 네이비 컬러의 크록스 클래식 클로그입니다. 가벼운 Croslite™ 소재가 발 전체를 편안하게 받쳐주며, 넓은 토박스와 통풍구가 여유로운 착용감을 제공합니다. 힐 스트랩을 뒤로 넘기면 발을 안정적으로 잡아주고 앞으로 올리면 간편한 슬립온으로 활용할 수 있습니다. 물과 오염에 강해 일상, 여행, 가벼운 야외활동에 폭넓게 사용할 수 있습니다.",
  "1011B873-401": "ASICS MAGIC SPEED 4 WIDE 수딩 씨/블랙은 레이스와 템포 러닝을 위한 남성용 와이드 핏 러닝화입니다. 통기성이 좋은 엔지니어드 메시 갑피와 풀렝스 카본 플레이트가 발의 움직임을 안정적으로 잡고 효율적인 토오프를 돕습니다. FF TURBO™와 FF BLAST™ PLUS 쿠셔닝을 조합해 가벼운 반발감과 충격 흡수를 제공하며, ASICSGRIP™ 아웃솔이 다양한 도로 환경에서 접지력을 높입니다. 기록 훈련과 장거리 페이스 러닝에 적합하며 개인의 발 형태에 맞는 사이즈 확인을 권장합니다.",
  "1011B873-750": "세이프티 옐로와 블랙의 강한 대비가 돋보이는 ASICS MAGIC SPEED 4 WIDE입니다. 넓은 발을 고려한 와이드 핏에 엔지니어드 메시 갑피를 적용해 통기성과 발등 고정력을 균형 있게 구성했습니다. 풀렝스 카본 플레이트가 전진 움직임을 돕고, FF TURBO™와 FF BLAST™ PLUS 폼이 템포 주행과 레이스에서 반응성 있는 쿠셔닝을 제공합니다. ASICSGRIP™ 고무 아웃솔은 노면 접지력을 보완하며, 실제 러닝 전에는 짧은 거리부터 적응하는 것을 권장합니다.",
};

function verifiedBatchMedia(sku: string) {
  return Array.from({ length: 5 }, (_, index) =>
    `/catalog/batch-1/${sku}/${String(index + 1).padStart(2, "0")}.webp`,
  );
}

export const VERIFIED_SKU_BATCH_1 = IMPORTED_SKU_DRAFTS.slice(0, 10).map((item) => {
  const mediaUrls = verifiedBatchMedia(item.sku);
  const sourceDomainCount = new Set(
    (item.sourceUrls || []).map(({ url }) => new URL(url).hostname.replace(/^www\./, "")),
  ).size;
  return {
    ...item,
    detailContent: VERIFIED_BATCH_1_DETAILS[item.sku] || item.description || "",
    imageUrl: mediaUrls[0],
    mediaUrls,
    sourceNote: `${sourceDomainCount}개 사이트에서 품번·색상·상품사진 교차 확인 · 배경 없는 사진과 흰 배경 사진을 대표·갤러리에 우선 사용`,
  };
});
