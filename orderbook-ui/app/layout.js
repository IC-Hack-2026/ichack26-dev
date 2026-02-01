import './globals.css';
import Header from '@/components/Header';

export const metadata = {
    title: 'Order Book Viewer',
    description: 'Real-time order book visualization for Polymarket',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <Header />
                <main>{children}</main>
            </body>
        </html>
    );
}
