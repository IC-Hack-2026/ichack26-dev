'use client';

import Link from 'next/link';

export default function Header() {
    return (
        <header className="header">
            <div className="header-content">
                <Link href="/" className="logo">
                    Order Book Viewer
                </Link>
                <nav className="nav">
                    <Link href="/">Dashboard</Link>
                </nav>
            </div>
        </header>
    );
}
