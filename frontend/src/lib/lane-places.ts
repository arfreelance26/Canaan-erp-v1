// Gazetteer for the Lane Map: trip origins/destinations are free text ("CHENNAI TO
// SALEM", "AS CFS", "COCHIN, KL"), so each one is normalised and looked up here.
// Coordinates are [lat, lon], accurate to the town — plenty for a route map.

const PLACES: Record<string, [number, number]> = {
  // Hubs
  TUTICORIN: [8.7642, 78.1348],
  CHENNAI: [13.0827, 80.2707],
  BANGALORE: [12.9716, 77.5946],
  COCHIN: [9.9312, 76.2673],
  // Tamil Nadu
  SALEM: [11.6643, 78.146],
  METTUR: [11.7883, 77.8026],
  OMALUR: [11.7377, 78.0432],
  NAMAKKAL: [11.2189, 78.1674],
  TIRUCHENGODE: [11.3831, 77.894],
  ERODE: [11.341, 77.7172],
  BHAVANI: [11.4453, 77.6822],
  PERUNDURAI: [11.2766, 77.5836],
  KANGAYAM: [10.9938, 77.5617],
  TIRUPPUR: [11.1085, 77.3411],
  GOBICHETTIPALAYAM: [11.4551, 77.4425],
  KUNNATHUR: [11.0913, 77.5685],
  COIMBATORE: [11.0168, 76.9558],
  SARAVANAMPATTI: [11.0792, 76.9931],
  ANNUR: [11.2367, 77.1013],
  POLLACHI: [10.6609, 77.0048],
  KUNDADAM: [10.7333, 77.5333],
  KRISHNAGIRI: [12.5266, 78.2141],
  HOSUR: [12.7409, 77.8253],
  DHARMAPURI: [12.1211, 78.1582],
  HARUR: [12.0533, 78.4821],
  POCHAMPALLI: [12.3536, 78.3709],
  MADURAI: [9.9252, 78.1198],
  DINDIGUL: [10.3673, 77.9803],
  VEDASANDUR: [10.5333, 77.95],
  NILAKOTTAI: [10.1667, 77.85],
  SIVAKASI: [9.4533, 77.7987],
  TENKASI: [8.9594, 77.3152],
  GANGAIKONDAN: [8.8583, 77.7417],
  TRICHY: [10.7905, 78.7047],
  VIRALIMALAI: [10.6, 78.55],
  DALMIAPURAM: [10.9333, 78.9333],
  KARUR: [10.9601, 78.0766],
  PUDUKKOTTAI: [10.3833, 78.8],
  KARAIKUDI: [10.0637, 78.7807],
  SINGAMPUNARI: [10.0833, 78.35],
  THONDI: [9.7439, 79.0128],
  ALANGUDI: [10.3667, 78.9833],
  KUMBAKONAM: [10.9602, 79.3845],
  KARAIKAL: [10.9254, 79.838],
  VILLUPURAM: [11.9401, 79.4861],
  THIRUVALANGADU: [13.1333, 79.8833],
  MELAKARANDAI: [12.85, 80.05],
  MEENSURUTTI: [11.4167, 79.2833],
  OTTHAKKAL_MANDAPAM: [8.2, 77.35],
  // Kerala
  // (Cochin is a hub above)
  // Karnataka
  CHAMRAJANAGAR: [11.9261, 76.9437],
  NANJANGUD: [12.1167, 76.6833],
  TUMKUR: [13.3392, 77.114],
  DODDABALLAPURA: [13.2957, 77.5376],
  NEELAMANGALA: [13.0997, 77.4],
  DOBBASPET: [13.25, 77.35],
  HAROHALLI: [12.6485, 77.4877],
  MALUR: [13.0037, 77.9391],
  HOSKOTE: [13.0707, 77.7982],
  THOLAYUR: [13.25, 80.0],
  // Beyond the visible map — drawn as edge arrows
  HINDUPURAM: [13.8283, 77.4913],
  KOPPAL: [15.35, 76.15],
  KRISHNAPATNAM: [14.25, 80.1167],
  HYDERABAD: [17.385, 78.4867],
  VISAKHAPATNAM: [17.6868, 83.2185],
};

// Spelling variants / port names → canonical key above.
const ALIASES: Record<string, string> = {
  BANGLORE: "BANGALORE",
  "COCHIN, KL": "COCHIN",
  "COCHIN PORT": "COCHIN",
  "CHENNAI PORT": "CHENNAI",
  "ANDHRA PORT": "KRISHNAPATNAM",
  THIRUCHENGODU: "TIRUCHENGODE",
  VILUPPURAM: "VILLUPURAM",
  TIRUCHIRAPALLI: "TRICHY",
  KANGEYAM: "KANGAYAM",
  NALMANGALA: "NEELAMANGALA",
  PUDUKOTTAI: "PUDUKKOTTAI",
  "OTTHAKKAL MANDAPAM": "OTTHAKKAL_MANDAPAM",
};

// Yards, CFS depots and villages inside the Tuticorin port area. At map scale they
// sit on top of Tuticorin, so they are counted as "port shuttles", not as lanes.
const LOCAL_TO_TUTICORIN = new Set([
  "TUTICORIN", "ALLIKULAM", "SWAMINATHAM", "KATTALANGULAM", "PASUVANTHANAI", "HARBOUR",
  "AS CFS", "RAJA CFS", "CONCOR CFS", "SEC CFS", "CGI YARD", "RAJA YARD",
]);

export type ResolvedPlace = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  /** A depot / yard in the Tuticorin port area. */
  local: boolean;
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s_-])([a-z])/g, (_, sp: string, c: string) => sp.replace("_", " ") + c.toUpperCase());

/** Turn a free-text origin/destination into a map place, or null when it isn't known. */
export function resolvePlace(raw?: string | null): ResolvedPlace | null {
  if (!raw) return null;
  let name = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!name) return null;
  // "CHENNAI TO SALEM" — the destination is what follows.
  const to = name.match(/^[A-Z ]+ TO (.+)$/);
  if (to) name = to[1];
  if (LOCAL_TO_TUTICORIN.has(name)) {
    const [lat, lon] = PLACES.TUTICORIN;
    return { key: "TUTICORIN", label: "Tuticorin", lat, lon, local: true };
  }
  const key = ALIASES[name] ?? name;
  const coords = PLACES[key];
  if (!coords) return null;
  return { key, label: titleCase(key), lat: coords[0], lon: coords[1], local: false };
}
