"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import styles from "./preview.module.css";

/** Fit the complete sheet inside the panel's visible area, preserving the app header. */
export function FittedTireSheet({children}:{children:ReactNode}){
 const frame=useRef<HTMLDivElement>(null),canvas=useRef<HTMLDivElement>(null);
 const [fit,setFit]=useState({scale:1,height:undefined as number|undefined});
 useEffect(()=>{
  const outer=frame.current,inner=canvas.current;if(!outer||!inner)return;
  let parent=outer.parentElement;
  while(parent&&!/auto|scroll/.test(getComputedStyle(parent).overflowY))parent=parent.parentElement;
  const viewport=parent;
  const update=()=>{
   const height=inner.offsetHeight;if(!height)return;
   const available=(viewport?.clientHeight||window.innerHeight)-20;
   const scale=Math.min(1,Math.max(1,available)/height);
   const next={scale,height:height*scale};
   setFit(old=>Math.abs(old.scale-next.scale)<.0001&&old.height===next.height?old:next);
  };
  const observer=new ResizeObserver(update);observer.observe(inner);observer.observe(outer);if(viewport)observer.observe(viewport);
  window.addEventListener("resize",update);update();
  return()=>{observer.disconnect();window.removeEventListener("resize",update);};
 },[]);
 return <div ref={frame} className={styles.fitFrame} style={{height:fit.height}}><div ref={canvas} className={styles.fitCanvas} style={{transform:`scale(${fit.scale})`}}>{children}</div></div>;
}
