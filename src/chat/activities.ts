import {create} from 'zustand';
import type {ChatMessage} from '../types/cbshub';
export const useActivities = create<{events: ChatMessage[]}>(()=>({events:[]}));
export function soundActivity(roomId:string, authorClientId:string, authorNickname:string, emoji:string, soundName:string) {
 useActivities.setState(s=>({events:[...s.events,{id:crypto.randomUUID(),roomId,authorClientId,authorNickname,authorAvatarColor:'',type:'soundboard',content:`${emoji} ${soundName}`,createdAt:Date.now(),reactions:{},soundMeta:{emoji,soundName}}].slice(-50) as ChatMessage[]}));
}
