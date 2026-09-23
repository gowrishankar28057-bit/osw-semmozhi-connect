'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="public-page"><h1>We couldn’t load this page</h1><p>Please check that the database is running and try again.</p><button className="button" onClick={reset}>Try again</button></main>;}
