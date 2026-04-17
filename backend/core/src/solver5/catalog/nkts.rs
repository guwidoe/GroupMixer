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
    &["2OP", "BVL", "D8K", "XIM", "CRU", "7NW", "AE4", "Y5Q", "3TH", "09S", "FG1", "6JZ"],
    &["3PQ", "CWM", "E9L", "HJN", "DSV", "8OX", "BF5", "Y6R", "4UI", "1AT", "G02", "7KZ"],
    &["4QR", "DXN", "FAM", "IKO", "ETW", "9PH", "CG6", "Y7S", "5VJ", "2BU", "013", "8LZ"],
    &["5RS", "EHO", "GBN", "JLP", "FUX", "AQI", "D07", "Y8T", "6WK", "3CV", "124", "9MZ"],
    &["6ST", "FIP", "0CO", "KMQ", "GVH", "BRJ", "E18", "Y9U", "7XL", "4DW", "235", "ANZ"],
    &["7TU", "GJQ", "1DP", "LNR", "0WI", "CSK", "F29", "YAV", "8HM", "5EX", "346", "BOZ"],
    &["8UV", "0KR", "2EQ", "MOS", "1XJ", "DTL", "G3A", "YBW", "9IN", "6FH", "457", "CPZ"],
    &["9VW", "1LS", "3FR", "NPT", "2HK", "EUM", "04B", "YCX", "AJO", "7GI", "568", "DQZ"],
    &["AWX", "2MT", "4GS", "OQU", "3IL", "FVN", "15C", "YDH", "BKP", "80J", "679", "ERZ"],
    &["BXH", "3NU", "50T", "PRV", "4JM", "GWO", "26D", "YEI", "CLQ", "91K", "78A", "FSZ"],
    &["CHI", "4OV", "61U", "QSW", "5KN", "0XP", "37E", "YFJ", "DMR", "A2L", "89B", "GTZ"],
    &["DIJ", "5PW", "72V", "RTX", "6LO", "1HQ", "48F", "YGK", "ENS", "B3M", "9AC", "0UZ"],
    &["EJK", "6QX", "83W", "SUH", "7MP", "2IR", "59G", "Y0L", "FOT", "C4N", "ABD", "1VZ"],
    &["FKL", "7RH", "94X", "TVI", "8NQ", "3JS", "6A0", "Y1M", "GPU", "D5O", "BCE", "2WZ"],
    &["GLM", "8SI", "A5H", "UWJ", "9OR", "4KT", "7B1", "Y2N", "0QV", "E6P", "CDF", "3XZ"],
    &["0MN", "9TJ", "B6I", "VXK", "APS", "5LU", "8C2", "Y3O", "1RW", "F7Q", "DEG", "4HZ"],
    &["1NO", "AUK", "C7J", "WHL", "BQT", "6MV", "9D3", "Y4P", "2SX", "G8R", "EF0", "5IZ"],
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
];

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static NktsCatalogEntry> {
    NKTS_CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups)
}

pub(crate) fn source() -> CatalogSource {
    NKTS_SOURCE
}
