import { CircleDollarSign, CreditCard, Globe2, Heart, PackageCheck, Radio, RotateCcw, ShieldCheck, ShoppingBag, Sparkles, Truck } from "lucide-react";
import type { CSSProperties } from "react";
import { QingdaoPage } from "../../../components/QingdaoShell";
import { getQingdaoStoreData } from "../../../lib/qingdao-data";

export const dynamic = "force-dynamic";
const fmt = (value: unknown) => Number(value || 0).toLocaleString("ko-KR");

type StoreProduct = {
  category: string;
  name: string;
  description: string;
  price: number;
  col: number;
  row: number;
  badge?: string;
  image?: string;
};

const categories = [
  ["전체 상품", "ALL"], ["농산물·건어물", "FARM"], ["차·음료", "TEA"],
  ["해산물·간식", "FOOD"], ["생활·기념품", "GIFT"],
];

const farmProducts: StoreProduct[] = [
  { category: "농산물·건어물", name: "볶음 참깨 350g", description: "투명창으로 내용물을 확인하는 소매 포장", price: 8900, col: 0, row: 0, badge: "요청 상품", image: "https://images.cdn.saveonfoods.com/zoom/00059966104109.jpg" },
  { category: "농산물·건어물", name: "칭다오 건어물 선물세트", description: "북어·생선포·오징어채로 구성된 포장 상품", price: 28900, col: 1, row: 0, badge: "요청 상품", image: "https://img.alicdn.com/i2/1810102203/O1CN01nFhI8J1S91LCoC5mk_%21%211810102203.jpg" },
  { category: "농산물·건어물", name: "붉은껍질 땅콩 1kg", description: "원산지와 영양정보가 표시된 밀봉 상품", price: 9900, col: 2, row: 0, badge: "TRAVEL PICK", image: "https://www.indianspiceshops.co.uk/image/cache/catalog/Web-Images/Product/2nd-batch/TOPOP-Peanuts-Red-Skin-1kg-1000x1000.jpg" },
  { category: "농산물·건어물", name: "산둥 견과 선물팩", description: "땅콩·호두·씨앗류를 개별 포장한 구성", price: 17900, col: 3, row: 0, image: "https://q3.itc.cn/q_70/images03/20240314/d33b56109b90489b994a3e6dae8d765b.jpeg" },
  { category: "농산물·건어물", name: "새우·김 건어물 9종", description: "건새우와 해조류를 한 상자에 담은 선물세트", price: 32900, col: 4, row: 0, image: "https://img.alicdn.com/bao/uploaded/i1/1810102203/O1CN01ZUvxmq1S91MPDzvJm_%21%212-item_pic.png_500x500q90" },
];

const products: StoreProduct[] = [
  { category: "차·음료", name: "라오산 녹차 200g 선물세트", description: "찻잎 캔과 전용 포장이 포함된 현지 선물 상품", price: 26900, col: 0, row: 1, badge: "LOCAL", image: "https://img.tepin.hk/HWG-DE/prt/4/b/b/1693276669241752.jpg" },
  { category: "차·음료", name: "라오산 봄 녹차 500g", description: "칭다오 풍경을 담은 프리미엄 패키지", price: 38900, col: 1, row: 1, image: "https://gw.alicdn.com/imgextra/i1/106951837/O1CN01EMzbdA1PROfr604WH_%21%21106951837.jpg" },
  { category: "차·음료", name: "라오산 녹차 틴 2종", description: "차 보관용 틴과 쇼핑백을 포함한 선물 구성", price: 29900, col: 2, row: 1, image: "https://img.tepin.hk/HWG-DE/prt/j/f/i/1693276669160274.jpg" },
  { category: "차·음료", name: "칭다오 인상 녹차 기프트", description: "여행 선물용으로 포장된 라오산 녹차", price: 35900, col: 3, row: 1, image: "https://gw.alicdn.com/imgextra/i1/106951837/O1CN01EMzbdA1PROfr604WH_%21%21106951837.jpg" },
  { category: "차·음료", name: "연꽃무늬 녹차 선물함", description: "차 캔과 선물함을 한 세트로 구성", price: 31900, col: 4, row: 1, image: "https://img.tepin.hk/HWG-DE/prt/4/b/b/1693276669241752.jpg" },
  { category: "해산물·간식", name: "해변인 건어물 간식 6종", description: "오징어채·생선포 등을 개별 포장한 상품", price: 29800, col: 0, row: 2, badge: "BEST", image: "https://img.alicdn.com/i4/1810102203/O1CN01jLqyME1S91L5nKxvd_%21%211810102203.jpg" },
  { category: "해산물·간식", name: "공항형 해산물 간식세트", description: "새우와 오징어 간식을 투명 박스에 구성", price: 16900, col: 1, row: 2, image: "https://oss.efoodline.com/product/product/20250410/220459_600180.jpg?x-oss-process=image%2Fresize%2Cm_lfit%2Cw_400%2Ch_400%2Fquality%2Cq_98" },
  { category: "해산물·간식", name: "곡소선 해산물 병 6종", description: "각기 다른 해산물 간식을 병에 나눠 포장", price: 23900, col: 2, row: 2, image: "https://img.alicdn.com/bao/uploaded/i3/3847370220/O1CN01ttK9z41DUnzhFF1Cv_%21%210-item_pic.jpg" },
  { category: "해산물·간식", name: "해산물 팔복 선물세트", description: "칭다오 오징어와 생선 간식 8종 구성", price: 32900, col: 3, row: 2, image: "https://img06.weeecdn.com/item/image/679/262/E6D7E6D8219CBE9.jpeg" },
  { category: "해산물·간식", name: "청도 해미·새우 선물함", description: "건새우와 해조류를 단정하게 포장한 세트", price: 34900, col: 4, row: 2, image: "https://www.yinxiangmall.com/images/2022/06/06/source_img/i3f668f83d4d7357226b3ab714d925b48.jpg" },
  { category: "생활·기념품", name: "맥주박물관 화창 마그넷", description: "맥주박물관 공식 디자인 금속 기념품", price: 9900, col: 0, row: 3, badge: "OFFICIAL", image: "https://img.alicdn.com/bao/uploaded/i1/4118259754/O1CN01i2LuFL2LvOBWYXOG6_%21%210-item_pic.jpg" },
  { category: "생활·기념품", name: "칭다오 1903 기념 컵", description: "맥주박물관 역사 그래픽을 담은 컵", price: 18900, col: 1, row: 3, image: "https://qp-bowuguan-web.oss-cn-qingdao.aliyuncs.com/2025/3/25/1904437352492322818.jpg" },
  { category: "생활·기념품", name: "칭다오 명소 병따개 마그넷", description: "잔교·오사광장·맥주를 담은 금속 기념품", price: 7900, col: 2, row: 3, badge: "ONLY", image: "https://gw.alicdn.com/imgextra/i1/3451227846/O1CN01GQuAjD27pWb5z8CI9_%21%213451227846.jpg_640x640q90.jpg" },
  { category: "생활·기념품", name: "칭다오 맥주 도자기잔", description: "박물관 기념품점에서 판매하는 장식 맥주잔", price: 26900, col: 3, row: 3, image: "https://ak-d.tripcdn.com/images/1mi51224x970hoco782ED.jpg?proc=source%2Ftrip" },
  { category: "생활·기념품", name: "칭다오 바다 기념품 컬렉션", description: "마그넷·엽서·키링을 모은 여행 선물 구성", price: 15900, col: 4, row: 3, image: "https://q1.itc.cn/q_70/images03/20250728/882700e932ab46e882cf119a7979d926.jpeg" },
];

const photoStyle = (product: StoreProduct) => ({
  backgroundImage: `url("${product.image}")`,
} as CSSProperties);

function ProductCard({ product, farm = false }: { product: StoreProduct; farm?: boolean }) {
  return <article className={farm ? "qg-farm-card" : undefined} id={product.category}>
    <button type="button" aria-label={`${product.name} 찜하기`}><Heart/></button>
    <div className="qg-real-product-photo" style={photoStyle(product)}>{product.badge && <b>{product.badge}</b>}</div>
    <small>{product.category}</small><h3>{product.name}</h3><p>{product.description}</p>
    <footer><strong>{fmt(product.price)}원</strong><em>현금·포인트</em></footer>
  </article>;
}

export default async function QingdaoStore() {
  const { data, signedIn } = await getQingdaoStoreData();
  const member = "member" in data ? (data as any).member : null;

  return <QingdaoPage eyebrow="QINGDAO SELECT" title="여행에서 만난 취향을, 다시 한국에서" description="칭다오와 중국에서 발견한 먹거리와 생활상품을 귀국 후 편하게 다시 주문하는 여행자 편집숍입니다." accent="orange">
    <section className="qg-curated-hero">
      <div className="qg-curated-copy"><span>FROM THE TRIP, TO YOUR HOME</span><h2>그때 맛있었던 것,<br/><em>다시 찾고 싶었던 것</em></h2><p>여행 중 만난 간식과 차, 소스와 생활소품을 한국에서 다시 주문하세요.<br/>현금·포인트·혼합결제를 모두 사용할 수 있습니다.</p><div><a href="#qingdao-products">상품 둘러보기</a><a href="/qingdao/rewards">내 리워드 확인</a></div></div>
      <div className="qg-curated-scene" aria-hidden="true"><i>茶</i><i>味</i><i>器</i><i>旅</i><span>QINGDAO<br/>MEMORIES</span></div>
      <aside><small>{signedIn ? "현재 사용 가능한 여행 포인트" : "여행자 회원 혜택"}</small><strong>{member ? `${fmt(member.available_points ?? member.points)}P` : "로그인 후 확인"}</strong><p>여행 후기·사진 인증·쇼핑으로 포인트가 이어집니다.</p><a href={signedIn ? "/qingdao/rewards" : "/qingdao/login?return_to=/qingdao/store"}>{signedIn ? "포인트 내역 보기" : "로그인하고 혜택 받기"}</a></aside>
    </section>

    <nav className="qg-curated-categories" aria-label="상품 카테고리">{categories.map(([name, icon], index) => <a className={index === 0 ? "active" : ""} href={index === 0 ? "#qingdao-products" : `#${name}`} key={name}><i>{icon}</i><span>{name}</span></a>)}</nav>

    <section className="qg-store-commerce-guide" aria-label="구매와 배송 안내">
      <article><CreditCard/><div><span>PAYMENT</span><b>현금 구매</b><p>무통장입금·카카오톡 송금 등 기존 쇼핑몰 결제 방식</p></div></article>
      <article><CircleDollarSign/><div><span>REWARD</span><b>포인트 구매</b><p>보유 포인트 전액 또는 일부를 주문에 사용</p></div></article>
      <article><Sparkles/><div><span>MIXED PAY</span><b>현금 + 포인트</b><p>부족한 금액만 현금으로 결제하는 혼합 방식</p></div></article>
      <article><Globe2/><div><span>GLOBAL ORDER</span><b>해외직구·통관</b><p>개인통관고유부호, 반입 제한과 관부가세를 주문 전에 안내</p></div></article>
    </section>

    <section className="qg-store-live"><div><span>QINGDAO LIVE SHOPPING</span><h2>칭다오 현지에서 상품을 보여드려요</h2><p>현지 매장과 시장의 상품을 생방송으로 확인하고 방송이 끝난 뒤에도 다시 주문할 수 있습니다.</p><div><a href="/#youtube-live"><Radio/> 생방송 보기</a><a href="/#products">방송 상품 전체보기</a></div></div><aside><b>LIVE</b><strong>현지 상품 확인</strong><span>실물 상태 · 용량 · 가격 · 배송 조건</span><small>현재 샘플 편성 영역입니다</small></aside></section>

    <section className="qg-curated-story"><div><span>TRAVELER'S PICK</span><h2>칭다오를 다녀온 사람들이<br/>다시 찾는 세 가지</h2><p>여행 후기와 현지 쇼핑 목록에서 자주 언급되는 차, 간식, 마트 기념품을 중심으로 보기 쉽게 묶었습니다.</p></div><article><b>01</b><i>茶</i><strong>라오산 차</strong><small>부담 없이 매일 마시는 칭다오의 향</small></article><article><b>02</b><i>味</i><strong>현지의 감칠맛</strong><small>한국 집밥에도 잘 어울리는 소스와 간식</small></article><article><b>03</b><i>旅</i><strong>작은 여행 기념</strong><small>선물하기 좋은 생활용품과 소품</small></article></section>

    <section className="qg-farm-products" id="농산물·건어물"><header><div><span>FARM & DRIED FOOD</span><h2>농산물·건어물 한 줄</h2><p>요청하신 참깨와 북어를 포함해 한국 식탁에서 다시 찾기 좋은 품목을 모았습니다.</p></div><small>샘플 구성 · 실제 판매 전 식품 수입 및 통관 요건 확인</small></header><div>{farmProducts.map((product) => <ProductCard product={product} farm key={product.name}/>)}</div></section>

    <section className="qg-curated-products" id="qingdao-products"><header><div><span>CURATED IN QINGDAO</span><h2>여행자 스토어</h2><p>여행 후 다시 사고 싶은 차·소스·간식·기념품을 실물형 이미지로 구성했습니다.</p></div><div><a href="/?account=orders">주문 내역</a><a href="/?cart=open"><ShoppingBag/> 장바구니</a></div></header><div>{products.map((product) => <ProductCard product={product} key={product.name}/>)}</div></section>

    <section className="qg-import-order-guide"><header><span>OVERSEAS DIRECT ORDER</span><h2>해외직구 주문과 통관도 한 흐름으로</h2><p>생방송이 없어도 상품 상세에서 주문하고, 통관정보와 배송상태를 마이페이지에서 확인합니다.</p></header><ol><li><b>01</b><strong>상품·옵션 선택</strong><span>용량, 수량, 원산지와 예상 배송비 확인</span></li><li><b>02</b><strong>결제 방식 선택</strong><span>현금·포인트·현금+포인트 중 선택</span></li><li><b>03</b><strong>통관정보 입력</strong><span>수취인과 개인통관고유부호, 연락처 확인</span></li><li><b>04</b><strong>검수·해외배송</strong><span>현지 검수 후 통관과 국내 배송상태 제공</span></li></ol><aside>식품·농산물은 가공 상태와 수량에 따라 반입이 제한될 수 있어 실제 주문 전에 품목별 통관 가능 여부를 확인합니다.</aside></section>

    <section className="qg-curated-trust"><div><ShieldCheck/><b>한국어 상품 안내</b><span>원재료·용량·제조사를 확인하기 쉽게</span></div><div><PackageCheck/><b>검수 후 출고</b><span>상품 상태와 포장을 한 번 더 확인</span></div><div><Truck/><b>통관·한국 배송</b><span>해외출고부터 국내 배송까지 한 화면에서</span></div><div><RotateCcw/><b>주문·상담</b><span>결제·통관·교환 문의를 한국어로</span></div><Sparkles aria-hidden="true"/></section>
  </QingdaoPage>;
}
