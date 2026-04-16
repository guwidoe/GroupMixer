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

const KP_30_WEEKS: &[&[&str]] = &[
    &["4CE", "6AI", "1DQ", "58R", "2KL", "0FO", "3JN", "7HM", "9GS", "BPT"],
    &["5DF", "0BJ", "27R", "69L", "3EM", "1GP", "4KO", "8IN", "AHS", "CQT"],
    &["67G", "1CK", "38L", "0AM", "4FN", "2HQ", "5EP", "9JO", "BIS", "DRT"],
    &["08H", "2DE", "49M", "1BN", "5GO", "3IR", "6FQ", "AKP", "CJS", "7LT"],
    &["19I", "37F", "5AN", "2CO", "6HP", "4JL", "0GR", "BEQ", "DKS", "8MT"],
    &["2AJ", "48G", "6BO", "3DP", "0IQ", "5KM", "1HL", "CFR", "7ES", "9NT"],
    &["3BK", "59H", "0CP", "47Q", "1JR", "6EN", "2IM", "DGL", "8FS", "AOT"],
    &["09K", "6CM", "7JP", "8EO", "124", "ABD", "FGI", "RLN", "5QS", "3HT"],
    &["1AE", "0DN", "8KQ", "9FP", "235", "BC7", "GHJ", "LMO", "6RS", "4IT"],
    &["2BF", "17O", "9ER", "AGQ", "346", "CD8", "HIK", "MNP", "0LS", "5JT"],
    &["3CG", "28P", "AFL", "BHR", "450", "D79", "IJE", "NOQ", "1MS", "6KT"],
    &["4DH", "39Q", "BGM", "CIL", "561", "78A", "JKF", "OPR", "2NS", "0ET"],
    &["57I", "4AR", "CHN", "DJM", "602", "89B", "KEG", "PQL", "3OS", "1FT"],
    &["68J", "5BL", "DIO", "7KN", "013", "9AC", "EFH", "QRM", "4PS", "2GT"],
];

const NKTS_CASES: &[NktsCatalogEntry] = &[
    NktsCatalogEntry {
        num_groups: 6,
        alphabet: "ABCDEFGHIabcdefghi",
        encoded_weeks: NKTS_18_WEEKS,
        citation: "NKTS(18) explicit schedule from Ed Pegg Jr., Math Games (2007), citing Kotzig–Rosa/Rees–Wallis",
    },
    NktsCatalogEntry {
        num_groups: 10,
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRST",
        encoded_weeks: KP_30_WEEKS,
        citation: "Explicit KP(30,14) direct construction via two initial parallel classes developed mod 7, as reproduced in the 2017 Konstanz thesis 'Construction, Application and Extension of Resolvable Balanced Incomplete Block Designs in the Design of Experiments', citing Baker–Wilson 1977",
    },
];

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static NktsCatalogEntry> {
    NKTS_CASES.iter().find(|entry| entry.num_groups == num_groups)
}

pub(crate) fn source() -> CatalogSource {
    NKTS_SOURCE
}
