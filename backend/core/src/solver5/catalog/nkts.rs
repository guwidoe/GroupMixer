use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NktsCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) alphabet: &'static str,
    pub(crate) encoded_weeks: &'static [&'static [&'static str]],
    pub(crate) citation: &'static str,
}

const NKTS_SOURCE: CatalogSource = CatalogSource {
    name: "nkts_catalog",
    citation: "Catalog-backed nearly Kirkman / Kirkman packing schedules from cited literature reproductions and explicit direct constructions",
};

const NKTS_18_WEEKS: &[&[&str]] = &[
    &["ABC", "DEF", "GHI", "ahf", "dbi", "gec"],
    &["Abc", "Def", "Ghi", "aHF", "dBI", "gEC"],
    &["abC", "deF", "ghI", "AHf", "DBi", "GEc"],
    &["aBc", "dEf", "gHi", "AhF", "DbI", "GeC"],
    &["ADG", "BEH", "CFI", "aei", "bfg", "cdh"],
    &["Adg", "Beh", "Cfi", "aEI", "bFG", "cDH"],
    &["adG", "beH", "cfI", "AEi", "BFg", "CDh"],
    &["aDg", "bEh", "cFi", "AeI", "BfG", "CdH"],
];

const NKTS_24_WEEKS: &[&[&str]] = &[
    &["0DH", "15C", "23I", "479", "6EF", "8MN", "ABK", "GJL"],
    &["035", "18J", "2LM", "4IN", "6BG", "7DK", "9AE", "CFH"],
    &["0BL", "1EI", "26D", "34J", "58A", "7FG", "9CN", "HKM"],
    &["0JK", "139", "2GN", "4BE", "5IM", "6AH", "78C", "DFL"],
    &["01G", "257", "3AL", "4CD", "6KN", "8BI", "9FM", "EHJ"],
    &["0AF", "146", "29K", "3CM", "5JN", "7BH", "8EL", "DGI"],
    &["028", "1FN", "3BD", "4HL", "59G", "67M", "AIJ", "CEK"],
    &["069", "1BM", "2FJ", "37E", "45K", "8GH", "ADN", "CIL"],
    &["07I", "1KL", "24A", "3HN", "5BF", "6CJ", "89D", "EGM"],
    &["04M", "12H", "368", "5DE", "7LN", "9BJ", "ACG", "FIK"],
    &["0EN", "17A", "2BC", "3GK", "48F", "56L", "9HI", "DJM"],
];

const KP_30_WEEKS: &[&[&str]] = &[
    &[
        "4CE", "6AI", "1DQ", "58R", "2KL", "0FO", "3JN", "7HM", "9GS", "BPT",
    ],
    &[
        "5DF", "0BJ", "27R", "69L", "3EM", "1GP", "4KO", "8IN", "AHS", "CQT",
    ],
    &[
        "67G", "1CK", "38L", "0AM", "4FN", "2HQ", "5EP", "9JO", "BIS", "DRT",
    ],
    &[
        "08H", "2DE", "49M", "1BN", "5GO", "3IR", "6FQ", "AKP", "CJS", "7LT",
    ],
    &[
        "19I", "37F", "5AN", "2CO", "6HP", "4JL", "0GR", "BEQ", "DKS", "8MT",
    ],
    &[
        "2AJ", "48G", "6BO", "3DP", "0IQ", "5KM", "1HL", "CFR", "7ES", "9NT",
    ],
    &[
        "3BK", "59H", "0CP", "47Q", "1JR", "6EN", "2IM", "DGL", "8FS", "AOT",
    ],
    &[
        "09K", "6CM", "7JP", "8EO", "124", "ABD", "FGI", "RLN", "5QS", "3HT",
    ],
    &[
        "1AE", "0DN", "8KQ", "9FP", "235", "BC7", "GHJ", "LMO", "6RS", "4IT",
    ],
    &[
        "2BF", "17O", "9ER", "AGQ", "346", "CD8", "HIK", "MNP", "0LS", "5JT",
    ],
    &[
        "3CG", "28P", "AFL", "BHR", "450", "D79", "IJE", "NOQ", "1MS", "6KT",
    ],
    &[
        "4DH", "39Q", "BGM", "CIL", "561", "78A", "JKF", "OPR", "2NS", "0ET",
    ],
    &[
        "57I", "4AR", "CHN", "DJM", "602", "89B", "KEG", "PQL", "3OS", "1FT",
    ],
    &[
        "68J", "5BL", "DIO", "7KN", "013", "9AC", "EFH", "QRM", "4PS", "2GT",
    ],
];

const KP_36_WEEKS: &[&[&str]] = &[
    &[
        "2OP", "BVL", "D8K", "XIM", "CRU", "7NW", "AE4", "Y5Q", "3TH", "09S", "FG1", "6JZ",
    ],
    &[
        "3PQ", "CWM", "E9L", "HJN", "DSV", "8OX", "BF5", "Y6R", "4UI", "1AT", "G02", "7KZ",
    ],
    &[
        "4QR", "DXN", "FAM", "IKO", "ETW", "9PH", "CG6", "Y7S", "5VJ", "2BU", "013", "8LZ",
    ],
    &[
        "5RS", "EHO", "GBN", "JLP", "FUX", "AQI", "D07", "Y8T", "6WK", "3CV", "124", "9MZ",
    ],
    &[
        "6ST", "FIP", "0CO", "KMQ", "GVH", "BRJ", "E18", "Y9U", "7XL", "4DW", "235", "ANZ",
    ],
    &[
        "7TU", "GJQ", "1DP", "LNR", "0WI", "CSK", "F29", "YAV", "8HM", "5EX", "346", "BOZ",
    ],
    &[
        "8UV", "0KR", "2EQ", "MOS", "1XJ", "DTL", "G3A", "YBW", "9IN", "6FH", "457", "CPZ",
    ],
    &[
        "9VW", "1LS", "3FR", "NPT", "2HK", "EUM", "04B", "YCX", "AJO", "7GI", "568", "DQZ",
    ],
    &[
        "AWX", "2MT", "4GS", "OQU", "3IL", "FVN", "15C", "YDH", "BKP", "80J", "679", "ERZ",
    ],
    &[
        "BXH", "3NU", "50T", "PRV", "4JM", "GWO", "26D", "YEI", "CLQ", "91K", "78A", "FSZ",
    ],
    &[
        "CHI", "4OV", "61U", "QSW", "5KN", "0XP", "37E", "YFJ", "DMR", "A2L", "89B", "GTZ",
    ],
    &[
        "DIJ", "5PW", "72V", "RTX", "6LO", "1HQ", "48F", "YGK", "ENS", "B3M", "9AC", "0UZ",
    ],
    &[
        "EJK", "6QX", "83W", "SUH", "7MP", "2IR", "59G", "Y0L", "FOT", "C4N", "ABD", "1VZ",
    ],
    &[
        "FKL", "7RH", "94X", "TVI", "8NQ", "3JS", "6A0", "Y1M", "GPU", "D5O", "BCE", "2WZ",
    ],
    &[
        "GLM", "8SI", "A5H", "UWJ", "9OR", "4KT", "7B1", "Y2N", "0QV", "E6P", "CDF", "3XZ",
    ],
    &[
        "0MN", "9TJ", "B6I", "VXK", "APS", "5LU", "8C2", "Y3O", "1RW", "F7Q", "DEG", "4HZ",
    ],
    &[
        "1NO", "AUK", "C7J", "WHL", "BQT", "6MV", "9D3", "Y4P", "2SX", "G8R", "EF0", "5IZ",
    ],
];

const KP_48_WEEKS: &[&[&str]] = &[
    &[
        "kEj", "124", "5AK", "37i", "6Fa", "8Jf", "9GZ", "BHN", "lbM", "OPR", "SXh", "QUL", "TcD",
        "VgI", "WdC", "Ye0",
    ],
    &[
        "kFN", "235", "6BL", "48j", "7Gb", "9Kg", "AHa", "CIO", "lc0", "PQS", "TYi", "RVM", "UdE",
        "WhJ", "XeD", "Zf1",
    ],
    &[
        "kGO", "346", "7CM", "59N", "8Hc", "ALh", "BIb", "DJP", "ld1", "QRT", "UZj", "SW0", "VeF",
        "XiK", "YfE", "ag2",
    ],
    &[
        "kHP", "457", "8D0", "6AO", "9Id", "BMi", "CJc", "EKQ", "le2", "RSU", "VaN", "TX1", "WfG",
        "YjL", "ZgF", "bh3",
    ],
    &[
        "kIQ", "568", "9E1", "7BP", "AJe", "C0j", "DKd", "FLR", "lf3", "STV", "WbO", "UY2", "XgH",
        "ZNM", "ahG", "ci4",
    ],
    &[
        "kJR", "679", "AF2", "8CQ", "BKf", "D1N", "ELe", "GMS", "lg4", "TUW", "XcP", "VZ3", "YhI",
        "aO0", "biH", "dj5",
    ],
    &[
        "kKS", "78A", "BG3", "9DR", "CLg", "E2O", "FMf", "H0T", "lh5", "UVX", "YdQ", "Wa4", "ZiJ",
        "bP1", "cjI", "eN6",
    ],
    &[
        "kLT", "89B", "CH4", "AES", "DMh", "F3P", "G0g", "I1U", "li6", "VWY", "ZeR", "Xb5", "ajK",
        "cQ2", "dNJ", "fO7",
    ],
    &[
        "kMU", "9AC", "DI5", "BFT", "E0i", "G4Q", "H1h", "J2V", "lj7", "WXZ", "afS", "Yc6", "bNL",
        "dR3", "eOK", "gP8",
    ],
    &[
        "k0V", "ABD", "EJ6", "CGU", "F1j", "H5R", "I2i", "K3W", "lN8", "XYa", "bgT", "Zd7", "cOM",
        "eS4", "fPL", "hQ9",
    ],
    &[
        "k1W", "BCE", "FK7", "DHV", "G2N", "I6S", "J3j", "L4X", "lO9", "YZb", "chU", "ae8", "dP0",
        "fT5", "gQM", "iRA",
    ],
    &[
        "k2X", "CDF", "GL8", "EIW", "H3O", "J7T", "K4N", "M5Y", "lPA", "Zac", "diV", "bf9", "eQ1",
        "gU6", "hR0", "jSB",
    ],
    &[
        "k3Y", "DEG", "HM9", "FJX", "I4P", "K8U", "L5O", "06Z", "lQB", "abd", "ejW", "cgA", "fR2",
        "hV7", "iS1", "NTC",
    ],
    &[
        "k4Z", "EFH", "I0A", "GKY", "J5Q", "L9V", "M6P", "17a", "lRC", "bce", "fNX", "dhB", "gS3",
        "iW8", "jT2", "OUD",
    ],
    &[
        "k5a", "FGI", "J1B", "HLZ", "K6R", "MAW", "07Q", "28b", "lSD", "cdf", "gOY", "eiC", "hT4",
        "jX9", "NU3", "PVE",
    ],
    &[
        "k6b", "GHJ", "K2C", "IMa", "L7S", "0BX", "18R", "39c", "lTE", "deg", "hPZ", "fjD", "iU5",
        "NYA", "OV4", "QWF",
    ],
    &[
        "k7c", "HIK", "L3D", "J0b", "M8T", "1CY", "29S", "4Ad", "lUF", "efh", "iQa", "gNE", "jV6",
        "OZB", "PW5", "RXG",
    ],
    &[
        "k8d", "IJL", "M4E", "K1c", "09U", "2DZ", "3AT", "5Be", "lVG", "fgi", "jRb", "hOF", "NW7",
        "PaC", "QX6", "SYH",
    ],
    &[
        "k9e", "JKM", "05F", "L2d", "1AV", "3Ea", "4BU", "6Cf", "lWH", "ghj", "NSc", "iPG", "OX8",
        "QbD", "RY7", "TZI",
    ],
    &[
        "kAf", "KL0", "16G", "M3e", "2BW", "4Fb", "5CV", "7Dg", "lXI", "hiN", "OTd", "jQH", "PY9",
        "RcE", "SZ8", "UaJ",
    ],
    &[
        "kBg", "LM1", "27H", "04f", "3CX", "5Gc", "6DW", "8Eh", "lYJ", "ijO", "PUe", "NRI", "QZA",
        "SdF", "Ta9", "VbK",
    ],
    &[
        "kCh", "M02", "38I", "15g", "4DY", "6Hd", "7EX", "9Fi", "lZK", "jNP", "QVf", "OSJ", "RaB",
        "TeG", "UbA", "WcL",
    ],
    &[
        "kDi", "013", "49J", "26h", "5EZ", "7Ie", "8FY", "AGj", "laL", "NOQ", "RWg", "PTK", "SbC",
        "UfH", "VcB", "XdM",
    ],
];

const KP_60_WEEKS: &[&[&str]] = &[
    &[
        "T0V", "SxW", "3HQ", "5GL", "7EO", "FIJ", "CKf", "24d", "Dpu", "9hs", "Rij", "Ngk", "Mbw",
        "1ev", "6cl", "AUq", "ant", "8Ym", "Por", "BXZ",
    ],
    &[
        "T1W", "0xX", "4IR", "6HM", "8FP", "GJK", "DLg", "35e", "Eqv", "Ait", "Sjk", "Ohl", "NcU",
        "2fw", "7dm", "BVr", "bou", "9Zn", "Qps", "CYa",
    ],
    &[
        "T2X", "1xY", "5JS", "7IN", "9GQ", "HKL", "EMh", "46f", "Frw", "Bju", "0kl", "Pim", "OdV",
        "3gU", "8en", "CWs", "cpv", "Aao", "Rqt", "DZb",
    ],
    &[
        "T3Y", "2xZ", "6K0", "8JO", "AHR", "ILM", "FNi", "57g", "GsU", "Ckv", "1lm", "Qjn", "PeW",
        "4hV", "9fo", "DXt", "dqw", "Bbp", "Sru", "Eac",
    ],
    &[
        "T4Z", "3xa", "7L1", "9KP", "BIS", "JMN", "GOj", "68h", "HtV", "Dlw", "2mn", "Rko", "QfX",
        "5iW", "Agp", "EYu", "erU", "Ccq", "0sv", "Fbd",
    ],
    &[
        "T5a", "4xb", "8M2", "ALQ", "CJ0", "KNO", "HPk", "79i", "IuW", "EmU", "3no", "Slp", "RgY",
        "6jX", "Bhq", "FZv", "fsV", "Ddr", "1tw", "Gce",
    ],
    &[
        "T6b", "5xc", "9N3", "BMR", "DK1", "LOP", "IQl", "8Aj", "JvX", "FnV", "4op", "0mq", "ShZ",
        "7kY", "Cir", "Gaw", "gtW", "Ees", "2uU", "Hdf",
    ],
    &[
        "T7c", "6xd", "AO4", "CNS", "EL2", "MPQ", "JRm", "9Bk", "KwY", "GoW", "5pq", "1nr", "0ia",
        "8lZ", "Djs", "HbU", "huX", "Fft", "3vV", "Ieg",
    ],
    &[
        "T8d", "7xe", "BP5", "DO0", "FM3", "NQR", "KSn", "ACl", "LUZ", "HpX", "6qr", "2os", "1jb",
        "9ma", "Ekt", "IcV", "ivY", "Ggu", "4wW", "Jfh",
    ],
    &[
        "T9e", "8xf", "CQ6", "EP1", "GN4", "ORS", "L0o", "BDm", "MVa", "IqY", "7rs", "3pt", "2kc",
        "Anb", "Flu", "JdW", "jwZ", "Hhv", "5UX", "Kgi",
    ],
    &[
        "TAf", "9xg", "DR7", "FQ2", "HO5", "PS0", "M1p", "CEn", "NWb", "JrZ", "8st", "4qu", "3ld",
        "Boc", "Gmv", "KeX", "kUa", "Iiw", "6VY", "Lhj",
    ],
    &[
        "TBg", "Axh", "ES8", "GR3", "IP6", "Q01", "N2q", "DFo", "OXc", "Ksa", "9tu", "5rv", "4me",
        "Cpd", "Hnw", "LfY", "lVb", "JjU", "7WZ", "Mik",
    ],
    &[
        "TCh", "Bxi", "F09", "HS4", "JQ7", "R12", "O3r", "EGp", "PYd", "Ltb", "Auv", "6sw", "5nf",
        "Dqe", "IoU", "MgZ", "mWc", "KkV", "8Xa", "Njl",
    ],
    &[
        "TDi", "Cxj", "G1A", "I05", "KR8", "S23", "P4s", "FHq", "QZe", "Muc", "Bvw", "7tU", "6og",
        "Erf", "JpV", "Nha", "nXd", "LlW", "9Yb", "Okm",
    ],
    &[
        "TEj", "Dxk", "H2B", "J16", "LS9", "034", "Q5t", "GIr", "Raf", "Nvd", "CwU", "8uV", "7ph",
        "Fsg", "KqW", "Oib", "oYe", "MmX", "AZc", "Pln",
    ],
    &[
        "TFk", "Exl", "I3C", "K27", "M0A", "145", "R6u", "HJs", "Sbg", "Owe", "DUV", "9vW", "8qi",
        "Gth", "LrX", "Pjc", "pZf", "NnY", "Bad", "Qmo",
    ],
    &[
        "TGl", "Fxm", "J4D", "L38", "N1B", "256", "S7v", "IKt", "0ch", "PUf", "EVW", "AwX", "9rj",
        "Hui", "MsY", "Qkd", "qag", "OoZ", "Cbe", "Rnp",
    ],
    &[
        "THm", "Gxn", "K5E", "M49", "O2C", "367", "08w", "JLu", "1di", "QVg", "FWX", "BUY", "Ask",
        "Ivj", "NtZ", "Rle", "rbh", "Ppa", "Dcf", "Soq",
    ],
    &[
        "TIn", "Hxo", "L6F", "N5A", "P3D", "478", "19U", "KMv", "2ej", "RWh", "GXY", "CVZ", "Btl",
        "Jwk", "Oua", "Smf", "sci", "Qqb", "Edg", "0pr",
    ],
    &[
        "TJo", "Ixp", "M7G", "O6B", "Q4E", "589", "2AV", "LNw", "3fk", "SXi", "HYZ", "DWa", "Cum",
        "KUl", "Pvb", "0ng", "tdj", "Rrc", "Feh", "1qs",
    ],
    &[
        "TKp", "Jxq", "N8H", "P7C", "R5F", "69A", "3BW", "MOU", "4gl", "0Yj", "IZa", "EXb", "Dvn",
        "LVm", "Qwc", "1oh", "uek", "Ssd", "Gfi", "2rt",
    ],
    &[
        "TLq", "Kxr", "O9I", "Q8D", "S6G", "7AB", "4CX", "NPV", "5hm", "1Zk", "Jab", "FYc", "Ewo",
        "MWn", "RUd", "2pi", "vfl", "0te", "Hgj", "3su",
    ],
    &[
        "TMr", "Lxs", "PAJ", "R9E", "07H", "8BC", "5DY", "OQW", "6in", "2al", "Kbc", "GZd", "FUp",
        "NXo", "SVe", "3qj", "wgm", "1uf", "Ihk", "4tv",
    ],
    &[
        "TNs", "Mxt", "QBK", "SAF", "18I", "9CD", "6EZ", "PRX", "7jo", "3bm", "Lcd", "Hae", "GVq",
        "OYp", "0Wf", "4rk", "Uhn", "2vg", "Jil", "5uw",
    ],
    &[
        "TOt", "Nxu", "RCL", "0BG", "29J", "ADE", "7Fa", "QSY", "8kp", "4cn", "Mde", "Ibf", "HWr",
        "PZq", "1Xg", "5sl", "Vio", "3wh", "Kjm", "6vU",
    ],
    &[
        "TPu", "Oxv", "SDM", "1CH", "3AK", "BEF", "8Gb", "R0Z", "9lq", "5do", "Nef", "Jcg", "IXs",
        "Qar", "2Yh", "6tm", "Wjp", "4Ui", "Lkn", "7wV",
    ],
    &[
        "TQv", "Pxw", "0EN", "2DI", "4BL", "CFG", "9Hc", "S1a", "Amr", "6ep", "Ofg", "Kdh", "JYt",
        "Rbs", "3Zi", "7un", "Xkq", "5Vj", "Mlo", "8UW",
    ],
    &[
        "TRw", "QxU", "1FO", "3EJ", "5CM", "DGH", "AId", "02b", "Bns", "7fq", "Pgh", "Lei", "KZu",
        "Sct", "4aj", "8vo", "Ylr", "6Wk", "Nmp", "9VX",
    ],
    &[
        "TSU", "RxV", "2GP", "4FK", "6DN", "EHI", "BJe", "13c", "Cot", "8gr", "Qhi", "Mfj", "Lav",
        "0du", "5bk", "9wp", "Zms", "7Xl", "Onq", "AWY",
    ],
];

const NKTS_CASES: &[NktsCatalogEntry] = &[
    NktsCatalogEntry {
        num_groups: 6,
        alphabet: "ABCDEFGHIabcdefghi",
        encoded_weeks: NKTS_18_WEEKS,
        citation: "NKTS(18) explicit schedule from Ed Pegg Jr., Math Games (2007), citing Kotzig–Rosa/Rees–Wallis",
    },
    NktsCatalogEntry {
        num_groups: 8,
        alphabet: "0123456789ABCDEFGHIJKLMN",
        encoded_weeks: NKTS_24_WEEKS,
        citation: "Exact NKTS(24) schedule synthesized in solver5 from a Z11+∞ cyclic orbit cover plus week-assignment search, matching the theorem-backed NKTS(24) existence line cited by Miller–Valkov–Abel 2026 and Pegg 2007 (Kotzig–Rosa / Rees–Stinson)",
    },
    NktsCatalogEntry {
        num_groups: 10,
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRST",
        encoded_weeks: KP_30_WEEKS,
        citation: "Explicit KP(30,14) direct construction via two initial parallel classes developed mod 7, as reproduced in the 2017 Konstanz thesis 'Construction, Application and Extension of Resolvable Balanced Incomplete Block Designs in the Design of Experiments', citing Baker–Wilson 1977",
    },
    NktsCatalogEntry {
        num_groups: 12,
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        encoded_weeks: KP_36_WEEKS,
        citation: "Explicit KP(36,17) direct construction via a single initial parallel class developed mod 17, as reproduced in the 2017 Konstanz thesis 'Construction, Application and Extension of Resolvable Balanced Incomplete Block Designs in the Design of Experiments', citing Wallis 2013 / Kotzig–Rosa",
    },
    NktsCatalogEntry {
        num_groups: 16,
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl",
        encoded_weeks: KP_48_WEEKS,
        citation: "Explicit KP(48,23) direct construction via a single initial parallel class on (Z23 ∪ ∞) × Z2 developed mod 23, as reproduced in the 2017 Konstanz thesis 'Construction, Application and Extension of Resolvable Balanced Incomplete Block Designs in the Design of Experiments', citing Baker–Wilson 1977",
    },
    NktsCatalogEntry {
        num_groups: 20,
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx",
        encoded_weeks: KP_60_WEEKS,
        citation: "Exact NKTS(60) schedule synthesized in solver5 from a cyclic initial parallel class on (Z29 ∪ ∞) × Z2 developed mod 29, matching the literature-backed NKTS(60) existence line cited by Rees–Wallis / Rees–Stinson and the Miller–Valkov–Abel 2026 Appendix B table",
    },
];

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static NktsCatalogEntry> {
    NKTS_CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups)
}

pub(crate) fn source() -> CatalogSource {
    NKTS_SOURCE
}
