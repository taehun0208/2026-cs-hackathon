import type { Mission, RunResult } from "./missions";
// Opaque-origin frame + worker; no network or account material. Each run is disposable.
export function runMission(
  mission: Mission,
  code: string,
  previewArgs?: unknown[],
): Promise<RunResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.hidden = true;
    frame.title = "분리된 코드 실행 영역";
    const token = crypto.randomUUID();
    let done = false;
    const finish = (r: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      frame.remove();
      resolve(r);
    };
    const listener = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.data?.token !== token) return;
      const r = e.data.result;
      if (
        !r ||
        !Array.isArray(r.tests) ||
        r.tests.length > mission.tests.length ||
        (r.error !== undefined &&
          (typeof r.error !== "string" || r.error.length > 2000)) ||
        !r.tests.every(
          (test: RunResult["tests"][number] | null) =>
            test &&
            typeof test === "object" &&
            typeof test.label === "string" &&
            test.label.length <= 200 &&
            typeof test.why === "string" &&
            test.why.length <= 600 &&
            typeof test.passed === "boolean" &&
            (test.error === undefined ||
              (typeof test.error === "string" && test.error.length <= 1000)),
        )
      ) {
        finish({
          tests: [],
          preview: null,
          error: "실행 결과 형식을 확인할 수 없어요. 반환값을 확인해주세요.",
        });
        return;
      }
      try {
        if (JSON.stringify(r).length > 50000) {
          finish({
            tests: [],
            preview: null,
            error:
              "실행 결과가 너무 커요. 필요한 항목만 반환하거나 출력 크기를 줄여주세요.",
          });
          return;
        }
      } catch {
        finish({
          tests: [],
          preview: null,
          error:
            "반환값을 표시할 수 없어요. 순환 참조나 BigInt 대신 일반 값·배열·객체를 반환해주세요.",
        });
        return;
      }
      finish(r);
    };
    window.addEventListener("message", listener);
    const timer = setTimeout(
      () =>
        finish({
          tests: [],
          preview: null,
          error:
            "실행 시간이 3초를 넘었어요. 반복문의 종료 조건을 확인하고 다시 실행해주세요.",
        }),
      3000,
    );
    const payload = {
      code,
      fn: mission.fn,
      tests: mission.tests,
      previewArgs: previewArgs ?? mission.previewArgs,
    };
    const workerCode = `onmessage=function(event){
   const p=event.data;
   const norm=x=>Array.isArray(x)?x.map(norm):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,norm(x[k])])):x;
   try{
    const fn=new Function('"use strict";\\n'+p.code+'\\n;return '+p.fn)();
    if(typeof fn!=='function')throw new Error(p.fn+' 함수를 찾을 수 없어요. 함수 이름을 유지해주세요.');
    const tests=p.tests.map(t=>{try{
     const args=JSON.parse(JSON.stringify(t.args));const before=JSON.stringify(args);const actual=fn(...args);
     if((JSON.stringify(actual)||'').length>20000)throw new Error('출력이 너무 커요. 필요한 결과만 반환해주세요.');
     const mutated=p.fn==='applyToEvent'&&before!==JSON.stringify(args);
     return {label:t.label,why:t.why,actual,expected:t.expected,passed:!mutated&&JSON.stringify(norm(actual))===JSON.stringify(norm(t.expected)),...(mutated?{error:'입력 배열은 변경하지 않아요.'}:{})};
    }catch(e){return{label:t.label,why:t.why,passed:false,error:String(e.message||e).slice(0,600)}}});
    let preview=null;try{preview=fn(...JSON.parse(JSON.stringify(p.previewArgs)));if((JSON.stringify(preview)||'').length>20000)preview=null;}catch(e){}
    postMessage({tests,preview});
   }catch(e){postMessage({tests:[],preview:null,error:String(e.message||e).slice(0,1000)})}
  };`;
    const script = `const token=${JSON.stringify(token)};const w=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}],{type:'text/javascript'})));w.onmessage=e=>{parent.postMessage({token,result:e.data},'*');w.terminate()};w.onerror=()=>parent.postMessage({token,result:{tests:[],preview:null,error:'코드를 실행할 수 없어요. 문법과 함수 이름을 확인해주세요.'}},'*');w.postMessage(${JSON.stringify(payload)});`;
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none';"><script>${script.replace(/<\/script/gi, "<\\/script")}</script>`;
    document.body.appendChild(frame);
  });
}
