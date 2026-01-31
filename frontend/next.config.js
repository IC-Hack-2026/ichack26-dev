/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'polymarket-upload.s3.us-east-2.amazonaws.com',
                pathname: '/**',
            },
        ],
    },
}

module.exports = nextConfig
