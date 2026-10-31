/** Public business details. All location surfaces read this single source. */
const googleCid = "15767349786229002623";
export const BUSINESS_LOCATION = {
  name: "Mera Software Digital Solutions",
  addressLines: ["Bus Stand to Railway Station Road", "Near Avtar Tailors, Majitha", "Punjab – 143601"],
  shortAddress: "Near Avtar Tailors, Majitha, Punjab 143601",
  mapsUrl: `https://www.google.com/maps?cid=${googleCid}`,
  directionsUrl: "https://www.google.com/maps/dir//Mera+Software+Digital+Solutions,+Bus+Stand,+to,+Railway+Station+Road,+near+Avtar+Tailors,+Majitha,+Punjab+143601/data=!4m8!4m7!1m0!1m5!1m1!1s0x391961df2e7b1e7d:0xdad0e1177182d17f!2m2!1d74.9511715!2d31.7570017",
  embedUrl: `https://www.google.com/maps?cid=${googleCid}&output=embed`,
  reviewsUrl: null as string | null,
} as const;
