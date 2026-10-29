import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const PRACTICE_CONTENT_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../content/practice');
const imagePath=/^yie-[123]\/topic-[0-9]{2,3}\.png$/;
export function readPracticeImage(path,hash,root=PRACTICE_CONTENT_ROOT){
 if(typeof path!=='string'||!imagePath.test(path)||!/^[a-f0-9]{64}$/.test(hash||''))throw Error('Test rasmi yaroqsiz');
 const base=realpathSync(root),file=realpathSync(resolve(base,path));
 if(!file.startsWith(base+sep))throw Error('Test rasmi yaroqsiz');
 const bytes=readFileSync(file);
 if(bytes.length>10*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Test rasmi tekshiruvdan o‘tmadi');
 return bytes;
}
export function loadPracticeCatalog(root=PRACTICE_CONTENT_ROOT){
 let data;try{data=JSON.parse(readFileSync(resolve(root,'catalog.json'),'utf8').replace(/^\uFEFF/,''));}catch{return [];}
 if(data?.schema_version!==1||!Array.isArray(data.topics))return [];
 const seen=new Set(),topics=[];
 for(const item of data.topics){
  if(!item||!['1','2','3'].includes(item.book_id)||!Number.isInteger(item.number)||item.number<1||item.number>999||typeof item.title!=='string'||!item.title.trim()||item.title.length>150||!Array.isArray(item.answers)||item.answers.length!==10||item.answers.some(a=>!['A','B','C','D'].includes(a))||!Array.isArray(item.explanations)||item.explanations.length!==10||item.explanations.some((x,i)=>typeof x!=='string'||x.length>280||!x.startsWith((i+1)+'. '+item.answers[i]+')')))return [];
  const key=item.book_id+':'+item.number;if(seen.has(key))return [];seen.add(key);
  let image=null;
  if(typeof item.image?.path==='string'&&item.image.path.startsWith('yie-'+item.book_id+'/')){
   try{readPracticeImage(item.image.path,item.image.sha256,root);image={path:item.image.path,sha256:item.image.sha256};}catch{}
  }
  topics.push({book_id:item.book_id,number:item.number,title:item.title.trim(),answers:[...item.answers],explanations:[...item.explanations],image});
 }
 return topics.sort((a,b)=>Number(a.book_id)-Number(b.book_id)||a.number-b.number);
}
export const PRACTICE_CATALOG=loadPracticeCatalog();
