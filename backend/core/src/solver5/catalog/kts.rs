use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct KtsCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) alphabet: &'static str,
    pub(crate) encoded_weeks: &'static [&'static [&'static str]],
    pub(crate) citation: &'static str,
}

const KTS_SOURCE: CatalogSource = CatalogSource {
    name: "kts_catalog",
    citation: "Catalog-backed Kirkman triple-system schedules from cited literature reproductions and explicit constructive derivations",
};

const KTS_9_WEEKS: &[&[&str]] = &[
    &["ABC", "DEF", "GHI"],
    &["AHF", "DBI", "GEC"],
    &["ADG", "BEH", "CFI"],
    &["AEI", "BFG", "CDH"],
];

const KTS_15_WEEKS: &[&[&str]] = &[
    &["ABC", "DEF", "GHI", "JKL", "MNO"],
    &["ADG", "BEJ", "CFM", "HKN", "ILO"],
    &["AEN", "BDO", "CHL", "FIK", "GJM"],
    &["AIM", "BGL", "CDK", "EHO", "FJN"],
    &["AHJ", "BKM", "CEI", "DLN", "FGO"],
    &["AFL", "BIN", "CJO", "DHM", "EGK"],
    &["AKO", "BFH", "CGN", "DIJ", "ELM"],
];

const KTS_51_WEEKS: &[&[&str]] = &[
    &["0Po", "18g", "6LQ", "E3V", "5Id", "74h", "FOW", "JGe", "DKi", "MNj", "9Al", "2BY", "CHR", "Ucb", "XTm", "knZ", "Sfa"],
    &["1Qo", "29h", "7MR", "A4W", "6JZ", "80i", "GKX", "FHf", "ELe", "NOk", "5Bm", "3CU", "DIS", "Vdc", "YPn", "lja", "Tgb"],
    &["2Ro", "35i", "8NS", "B0X", "7Fa", "91e", "HLY", "GIg", "AMf", "OKl", "6Cn", "4DV", "EJT", "WZd", "UQj", "mkb", "Phc"],
    &["3So", "46e", "9OT", "C1Y", "8Gb", "52f", "IMU", "HJh", "BNg", "KLm", "7Dj", "0EW", "AFP", "XaZ", "VRk", "nlc", "Qid"],
    &["4To", "07f", "5KP", "D2U", "9Hc", "63g", "JNV", "IFi", "COh", "LMn", "8Ek", "1AX", "BGQ", "Yba", "WSl", "jmd", "ReZ"],
    &["5Uo", "6Dl", "B1V", "J8a", "ANi", "C9m", "K4b", "OLj", "I0n", "23P", "EFR", "7Gd", "HMW", "Zhg", "cYS", "QTe", "Xkf"],
    &["6Vo", "7Em", "C2W", "F9b", "BOe", "D5n", "L0c", "KMk", "J1j", "34Q", "AGS", "8HZ", "INX", "aih", "dUT", "RPf", "Ylg"],
    &["7Wo", "8An", "D3X", "G5c", "CKf", "E6j", "M1d", "LNl", "F2k", "40R", "BHT", "9Ia", "JOY", "bei", "ZVP", "SQg", "Umh"],
    &["8Xo", "9Bj", "E4Y", "H6d", "DLg", "A7k", "N2Z", "MOm", "G3l", "01S", "CIP", "5Jb", "FKU", "cfe", "aWQ", "TRh", "Vni"],
    &["9Yo", "5Ck", "A0U", "I7Z", "EMh", "B8l", "O3a", "NKn", "H4m", "12T", "DJQ", "6Fc", "GLV", "dgf", "bXR", "PSi", "Wje"],
    &["AZo", "BIR", "G6a", "ODf", "F3n", "HES", "09g", "41P", "N5T", "78U", "JKW", "CLi", "M2b", "eml", "hdX", "VYj", "cQk"],
    &["Bao", "CJS", "H7b", "KEg", "G4j", "IAT", "15h", "02Q", "O6P", "89V", "FLX", "DMe", "N3c", "fnm", "iZY", "WUk", "dRl"],
    &["Cbo", "DFT", "I8c", "LAh", "H0k", "JBP", "26i", "13R", "K7Q", "95W", "GMY", "ENf", "O4d", "gjn", "eaU", "XVl", "ZSm"],
    &["Dco", "EGP", "J9d", "MBi", "I1l", "FCQ", "37e", "24S", "L8R", "56X", "HNU", "AOg", "K0Z", "hkj", "fbV", "YWm", "aTn"],
    &["Edo", "AHQ", "F5Z", "NCe", "J2m", "GDR", "48f", "30T", "M9S", "67Y", "IOV", "BKh", "L1a", "ilk", "gcW", "UXn", "bPj"],
    &["Feo", "GNW", "LBf", "4Ik", "K8T", "MJX", "5El", "96U", "3AY", "CDZ", "O0b", "H1n", "27g", "jSR", "mic", "adP", "hVQ"],
    &["Gfo", "HOX", "MCg", "0Jl", "L9P", "NFY", "6Am", "57V", "4BU", "DEa", "K1c", "I2j", "38h", "kTS", "ned", "bZQ", "iWR"],
    &["Hgo", "IKY", "NDh", "1Fm", "M5Q", "OGU", "7Bn", "68W", "0CV", "EAb", "L2d", "J3k", "49i", "lPT", "jfZ", "caR", "eXS"],
    &["Iho", "JLU", "OEi", "2Gn", "N6R", "KHV", "8Cj", "79X", "1DW", "ABc", "M3Z", "F4l", "05e", "mQP", "kga", "dbS", "fYT"],
    &["Jio", "FMV", "KAe", "3Hj", "O7S", "LIW", "9Dk", "85Y", "2EX", "BCd", "N4a", "G0m", "16f", "nRQ", "lhb", "ZcT", "gUP"],
    &["Kjo", "L3b", "1Gk", "9NQ", "0DY", "2Oc", "AJR", "EBZ", "8Fd", "HIe", "45g", "M6T", "7Cl", "PXW", "Snh", "fiU", "maV"],
    &["Lko", "M4c", "2Hl", "5OR", "1EU", "3Kd", "BFS", "ACa", "9GZ", "IJf", "06h", "N7P", "8Dm", "QYX", "Tji", "geV", "nbW"],
    &["Mlo", "N0d", "3Im", "6KS", "2AV", "4LZ", "CGT", "BDb", "5Ha", "JFg", "17i", "O8Q", "9En", "RUY", "Pke", "hfW", "jcX"],
    &["Nmo", "O1Z", "4Jn", "7LT", "3BW", "0Ma", "DHP", "CEc", "6Ib", "FGh", "28e", "K9R", "5Aj", "SVU", "Qlf", "igX", "kdY"],
    &["Ono", "K2a", "0Fj", "8MP", "4CX", "1Nb", "EIQ", "DAd", "7Jc", "GHi", "39f", "L5S", "6Bk", "TWV", "Rmg", "ehY", "lZU"],
];

const KTS_CASES: &[KtsCatalogEntry] = &[
    KtsCatalogEntry {
        num_groups: 3,
        alphabet: "ABCDEFGHI",
        encoded_weeks: KTS_9_WEEKS,
        citation: "KTS(9) explicit schedule from Ed Pegg Jr., Math Games (2007)",
    },
    KtsCatalogEntry {
        num_groups: 5,
        alphabet: "ABCDEFGHIJKLMNO",
        encoded_weeks: KTS_15_WEEKS,
        citation: "KTS(15) explicit schedule from Ed Pegg Jr., Math Games (2007)",
    },
    KtsCatalogEntry {
        num_groups: 17,
        alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno",
        encoded_weeks: KTS_51_WEEKS,
        citation: "Exact KTS(51) schedule synthesized in solver5 from the finite-field 2q+1 construction of Ray-Chaudhuri–Wilson 1971 / Stinson 1991, matching Sage's kirkman_triple_system implementation for q=25",
    },
];

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static KtsCatalogEntry> {
    KTS_CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups)
}

pub(crate) fn source() -> CatalogSource {
    KTS_SOURCE
}
