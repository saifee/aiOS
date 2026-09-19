/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: "export",                 // static export — served by the API process
  images: { unoptimized: true },    // required for export
  trailingSlash: false,
};
