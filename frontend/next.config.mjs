/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // issue_photos stores a provider-agnostic URL column (migration 009), and the
    // upload path fills it with a Cloudinary secure_url. Every reader renders those
    // rows, so the host has to be allowed here or next/image throws on them.
    remotePatterns: [new URL("https://res.cloudinary.com/**")],
  },
};

export default nextConfig;
