export const API = (import.meta.env.VITE_API_BASE_URL || "https://hackthon-for-aft8.onrender.com").replace(/\/+$/, "");
let token=sessionStorage.getItem("deep_token")||"";

const LOGIN_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const UPLOAD_TIMEOUT_MS = 180_000;

export function setAuthToken(value:string){
  token=value;
  sessionStorage.setItem("deep_token",value);
}

export function clearAuthToken(){
  token="";
  sessionStorage.removeItem("deep_token");
}

async function req(path:string,opt:any={}){
  const {timeoutMs,signal:_externalSignal,...fetchOptions}=opt;
  const requestTimeout=Number(timeoutMs|| (path==="/api/auth/login" ? LOGIN_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS));
  const h=new Headers(fetchOptions.headers||{});
  if(token)h.set("Authorization","Bearer "+token);
  if(fetchOptions.body && !(fetchOptions.body instanceof FormData))h.set("Content-Type","application/json");

  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),requestTimeout);
  try{
    const r=await fetch(API+path,{...fetchOptions,headers:h,signal:controller.signal});
    const raw=await r.text();
    let d:any={};
    try{d=raw?JSON.parse(raw):{}}catch{d={detail:raw}}
    if(!r.ok)throw new Error(d.detail||d.message||("Request failed (HTTP "+r.status+")"));
    return d;
  }catch(error:any){
    if(error?.name==="AbortError"){
      if(path==="/api/auth/login"){
        throw new Error("Sign-in timed out after 30 seconds. The service may be waking up or temporarily busy. Please try again.");
      }
      throw new Error("This request took too long to respond. Check your connection and try again.");
    }
    if(error instanceof TypeError){
      throw new Error("Could not reach DeepSearch. Check your internet connection and try again.");
    }
    throw error;
  }finally{
    window.clearTimeout(timeout);
  }
}

function uploadFile(file:File,onProgress?:(loaded:number,total:number)=>void):Promise<any>{
  return new Promise((resolve,reject)=>{
    const form=new FormData();
    form.append("file",file);
    const xhr=new XMLHttpRequest();
    xhr.open("POST",API+"/api/files/upload",true);
    xhr.timeout=UPLOAD_TIMEOUT_MS;
    if(token)xhr.setRequestHeader("Authorization","Bearer "+token);

    xhr.upload.onprogress=(event)=>{
      if(!onProgress)return;
      const total=event.lengthComputable?event.total:file.size;
      onProgress(Math.min(event.loaded,total),total);
    };
    xhr.onload=()=>{
      let data:any={};
      try{data=xhr.responseText?JSON.parse(xhr.responseText):{}}
      catch{data={detail:xhr.responseText}}
      if(xhr.status>=200&&xhr.status<300){
        resolve(data);
        return;
      }
      reject(new Error(data.detail||data.message||("Upload failed (HTTP "+xhr.status+").")));
    };
    xhr.onerror=()=>reject(new Error("The upload connection was interrupted. DeepSearch could not confirm that the file was saved. Please retry."));
    xhr.ontimeout=()=>reject(new Error("Upload timed out after 3 minutes. The server did not confirm the file. Check your connection and retry."));
    xhr.onabort=()=>reject(new Error("Upload was cancelled before the server confirmed it."));
    xhr.send(form);
  });
}

export const api={
  login:async(p:any)=>{
    const d=await req("/api/auth/login",{method:"POST",body:JSON.stringify(p),timeoutMs:LOGIN_TIMEOUT_MS});
    setAuthToken(d.access_token);
    return d;
  },
  register:async(p:any)=>{const d=await req("/api/auth/register",{method:"POST",body:JSON.stringify(p)});if(d.access_token)setAuthToken(d.access_token);return d;},
  verifyRegistration:async(p:any)=>{
    const d=await req("/api/auth/verify-registration",{method:"POST",body:JSON.stringify(p)});
    setAuthToken(d.access_token);
    return d;
  },
  resendRegistrationOtp:(email:string)=>req("/api/auth/resend-registration-otp",{method:"POST",body:JSON.stringify({email})}),
  forgotPassword:(email:string)=>req("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email})}),
  verifyResetOtp:(p:any)=>req("/api/auth/verify-reset-otp",{method:"POST",body:JSON.stringify(p)}),
  resetPassword:(p:any)=>req("/api/auth/reset-password",{method:"POST",body:JSON.stringify(p)}),
  me:()=>req("/api/auth/me"),
  files:()=>req("/api/files"),
  stats:()=>req("/api/corpus/stats"),
  file:(id:string)=>req("/api/files/"+id),
  chunks:(id:string)=>req("/api/files/"+id+"/chunks?limit=50"),
  deleteFile:(id:string)=>req("/api/files/"+id,{method:"DELETE"}),
  reindexFile:(id:string)=>req("/api/files/"+id+"/reindex",{method:"POST"}),
  upload:(f:File,onProgress?:(loaded:number,total:number)=>void)=>uploadFile(f,onProgress),
  uploadJob:(id:string)=>req("/api/files/upload-jobs/"+id,{timeoutMs:15_000}),
  search:(query:string,limit=20)=>req("/api/search",{method:"POST",body:JSON.stringify({query,limit})}),
  deepSearch:(query:string,limit=20)=>req("/api/deep-search",{method:"POST",body:JSON.stringify({query,limit,with_ai:true})}),
  answer:(query:string)=>req("/api/ai/answer",{method:"POST",body:JSON.stringify({query,limit:12})}),
  evaluationBenchmark:()=>req("/api/evaluation/benchmark?limit=6"),
  evaluationSnapshot:(query:string,limit=5)=>req("/api/evaluation/snapshot",{method:"POST",body:JSON.stringify({query,limit})}),
  evaluationCompare:(before:any,query:string,limit=5)=>req("/api/evaluation/compare",{method:"POST",body:JSON.stringify({before,query,limit})}),
  chats:(fileId?:string)=>req("/api/chats"+(fileId?"?file_id="+encodeURIComponent(fileId):"")),
  chatMessage:(message:string,threadId?:string,fileId?:string)=>req("/api/chats/message",{method:"POST",body:JSON.stringify({message,thread_id:threadId||null,file_id:fileId||null})}),
  history:()=>req("/api/history?limit=100"),
  deleteHistory:(id:string)=>req("/api/history/"+id,{method:"DELETE"})
};
