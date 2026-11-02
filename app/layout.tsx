import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/source-serif-4/400.css';
import './globals.css';
export const metadata: Metadata = { icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.svg` }, title: 'RSIBench-Infra-Lite & RSIBench-Infra — Can Agents Optimize Their Own Infrastructure?', description: 'A production-scale benchmark for agent-driven training and inference optimization. Explore model rankings and results across 20 tasks.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
