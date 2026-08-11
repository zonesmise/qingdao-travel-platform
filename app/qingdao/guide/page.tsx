import { QingdaoPage } from "../../../components/QingdaoShell";
const places=["팔대관","잔교","소어산공원","칭다오 맥주박물관","오사광장","요트센터"];
export default function Guide(){return <QingdaoPage eyebrow="LOCAL GUIDE" title="여행 가이드" description="장소 상세정보와 이동 방법, 주변 추천을 여행상품과 함께 확인하세요."><div className="qg-guide-grid">{places.map((x,i)=><article key={x}><div className={`qg-place-image p${i+1}`}/><span>{i%2?"도시·명소":"역사·문화"}</span><h2>{x}</h2><p>추천 시간, 교통과 현지에서 놓치지 말아야 할 정보를 정리했습니다.</p><div><small>★ 4.{8-i%2}</small><a href="/qingdao/planner">일정에 추가 →</a></div></article>)}</div></QingdaoPage>}
