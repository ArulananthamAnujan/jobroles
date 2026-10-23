'use client';
import {useEffect} from 'react';
// Registers the service worker in production so the site can be installed and shows an offline page.
export default function Pwa(){useEffect(()=>{if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);return null;}
