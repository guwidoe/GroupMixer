use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct OwnSgCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) starter_blocks: &'static [&'static [usize]],
    pub(crate) citation: &'static str,
}

const OWNSG_SOURCE: CatalogSource = CatalogSource {
    name: "ownsg_catalog",
    citation: "Catalog-backed ownSG starter-block bank from Miller–Valkov–Abel 2026, Appendix A / Construction 5",
};

const OWNSG_60_6_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5],
    &[0, 7, 14, 21, 28, 35],
    &[0, 8, 13, 23, 33, 46],
    &[0, 9, 17, 19, 34, 50],
    &[0, 11, 15, 32, 49, 58],
    &[0, 16, 25, 41, 44, 57],
    &[0, 20, 29, 40, 43, 51],
];

const OWNSG_70_7_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6],
    &[0, 8, 16, 24, 32, 40, 48],
    &[0, 9, 15, 26, 38, 60, 69],
    &[0, 10, 19, 25, 30, 43, 55],
    &[0, 12, 27, 44, 53, 59, 64],
    &[0, 13, 18, 22, 31, 61, 65],
    &[0, 17, 23, 34, 54, 57, 67],
];

const OWNSG_80_8_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7],
    &[0, 9, 18, 27, 36, 45, 54, 63],
    &[0, 10, 17, 29, 39, 43, 68, 78],
    &[0, 11, 22, 25, 44, 55, 69, 74],
    &[0, 19, 31, 38, 42, 53, 65, 76],
];

const OWNSG_84_6_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5],
    &[0, 7, 14, 21, 28, 35],
    &[0, 8, 13, 23, 33, 46],
    &[0, 9, 17, 19, 32, 58],
    &[0, 10, 15, 20, 31, 47],
    &[0, 11, 16, 25, 44, 57],
    &[0, 22, 26, 45, 71, 79],
    &[0, 27, 55, 64, 77, 80],
    &[0, 37, 52, 63, 74, 83],
];

const OWNSG_84_7_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6],
    &[0, 8, 16, 24, 32, 40, 48],
    &[0, 9, 15, 26, 38, 53, 76],
    &[0, 10, 19, 22, 37, 55, 67],
    &[0, 11, 17, 30, 43, 69, 82],
    &[0, 12, 41, 45, 51, 74, 78],
    &[0, 18, 23, 61, 66, 71, 83],
];

const OWNSG_90_6_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5],
    &[0, 7, 14, 21, 28, 35],
    &[0, 8, 13, 23, 33, 46],
    &[0, 9, 17, 19, 32, 58],
    &[0, 10, 15, 20, 31, 47],
    &[0, 11, 16, 25, 44, 63],
    &[0, 22, 26, 55, 77, 81],
    &[0, 27, 49, 64, 80, 89],
    &[0, 29, 38, 61, 69, 88],
    &[0, 40, 59, 62, 75, 79],
];

const OWNSG_90_9_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7, 8],
    &[0, 10, 20, 30, 40, 50, 60, 70, 80],
    &[0, 11, 19, 33, 44, 52, 57, 68, 76],
    &[0, 13, 26, 32, 37, 48, 61, 69, 74],
    &[0, 17, 22, 34, 38, 51, 59, 66, 73],
];

const OWNSG_96_8_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7],
    &[0, 9, 18, 27, 36, 45, 54, 63],
    &[0, 10, 17, 29, 39, 43, 60, 86],
    &[0, 11, 21, 25, 42, 55, 62, 84],
    &[0, 12, 31, 46, 50, 61, 67, 89],
    &[0, 19, 38, 44, 49, 69, 74, 95],
];

const OWNSG_98_7_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6],
    &[0, 8, 16, 24, 32, 40, 48],
    &[0, 9, 15, 26, 38, 53, 76],
    &[0, 10, 19, 22, 37, 55, 67],
    &[0, 11, 17, 23, 36, 54, 83],
    &[0, 12, 18, 27, 29, 51, 66],
    &[0, 13, 47, 58, 81, 85, 94],
    &[0, 25, 30, 69, 82, 87, 92],
];

const OWNSG_105_7_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6],
    &[0, 8, 16, 24, 32, 40, 48],
    &[0, 9, 15, 26, 38, 53, 76],
    &[0, 10, 19, 22, 37, 55, 67],
    &[0, 11, 17, 23, 36, 54, 83],
    &[0, 12, 18, 27, 29, 51, 73],
    &[0, 20, 30, 45, 50, 81, 103],
    &[0, 25, 44, 71, 90, 96, 101],
    &[0, 43, 52, 69, 72, 82, 95],
];

const OWNSG_112_8_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7],
    &[0, 9, 18, 27, 36, 45, 54, 63],
    &[0, 10, 17, 29, 39, 43, 60, 86],
    &[0, 11, 21, 25, 42, 55, 62, 84],
    &[0, 12, 19, 26, 41, 69, 94, 111],
    &[0, 14, 28, 34, 59, 71, 93, 105],
    &[0, 15, 20, 30, 33, 53, 58, 107],
    &[0, 31, 50, 61, 76, 81, 91, 110],
];

const OWNSG_120_6_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5],
    &[0, 7, 14, 21, 28, 35],
    &[0, 8, 13, 23, 33, 46],
    &[0, 9, 17, 19, 32, 58],
    &[0, 10, 15, 20, 31, 47],
    &[0, 11, 16, 25, 44, 57],
    &[0, 22, 26, 45, 49, 71],
    &[0, 27, 38, 55, 70, 89],
    &[0, 29, 37, 63, 80, 88],
    &[0, 34, 73, 81, 110, 119],
    &[0, 39, 59, 76, 91, 116],
    &[0, 40, 53, 56, 93, 115],
    &[0, 41, 50, 79, 106, 117],
];

const OWNSG_126_7_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6],
    &[0, 8, 16, 24, 32, 40, 48],
    &[0, 9, 15, 26, 38, 53, 76],
    &[0, 10, 19, 22, 37, 55, 67],
    &[0, 11, 17, 23, 36, 54, 83],
    &[0, 12, 18, 27, 29, 51, 66],
    &[0, 13, 30, 39, 57, 96, 122],
    &[0, 20, 25, 45, 65, 75, 120],
    &[0, 31, 41, 44, 64, 89, 123],
    &[0, 34, 47, 80, 85, 102, 121],
];

const OWNSG_126_9_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7, 8],
    &[0, 10, 20, 30, 40, 50, 60, 70, 80],
    &[0, 11, 19, 32, 43, 48, 67, 96, 125],
    &[0, 12, 23, 28, 44, 47, 61, 69, 94],
    &[0, 13, 24, 29, 41, 88, 107, 111, 118],
    &[0, 17, 52, 55, 78, 86, 101, 112, 120],
    &[0, 34, 38, 51, 62, 77, 84, 109, 121],
];

const OWNSG_135_9_STARTERS: &[&[usize]] = &[
    &[0, 1, 2, 3, 4, 5, 6, 7, 8],
    &[0, 10, 20, 30, 40, 50, 60, 70, 80],
    &[0, 11, 19, 32, 43, 48, 67, 96, 125],
    &[0, 12, 23, 28, 44, 47, 61, 69, 94],
    &[0, 13, 21, 29, 52, 73, 104, 116, 132],
    &[0, 14, 22, 37, 79, 92, 111, 123, 134],
    &[0, 35, 39, 76, 82, 97, 114, 119, 131],
];

const CASES: &[OwnSgCatalogEntry] = &[
    OwnSgCatalogEntry {
        num_groups: 14,
        group_size: 6,
        starter_blocks: OWNSG_84_6_STARTERS,
        citation: "Starter blocks for ownSG(84,6) with 9 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 12,
        group_size: 7,
        starter_blocks: OWNSG_84_7_STARTERS,
        citation: "Starter blocks for ownSG(84,7) with 7 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 6,
        starter_blocks: OWNSG_60_6_STARTERS,
        citation: "Starter blocks for ownSG(60,6) with 7 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 7,
        starter_blocks: OWNSG_70_7_STARTERS,
        citation: "Starter blocks for ownSG(70,7) with 7 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 8,
        starter_blocks: OWNSG_80_8_STARTERS,
        citation: "Starter blocks for ownSG(80,8) with 5 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 15,
        group_size: 6,
        starter_blocks: OWNSG_90_6_STARTERS,
        citation: "Starter blocks for ownSG(90,6) with 10 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 10,
        group_size: 9,
        starter_blocks: OWNSG_90_9_STARTERS,
        citation: "Starter blocks for ownSG(90,9) with 5 rounds from Miller–Valkov–Abel 2026, Appendix A Table A1",
    },
    OwnSgCatalogEntry {
        num_groups: 12,
        group_size: 8,
        starter_blocks: OWNSG_96_8_STARTERS,
        citation: "Starter blocks for ownSG(96,8) with 6 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 14,
        group_size: 7,
        starter_blocks: OWNSG_98_7_STARTERS,
        citation: "Starter blocks for ownSG(98,7) with 8 base rounds from Miller–Valkov–Abel 2026 Appendix ownSG table; the paper notes an additional +G(1) round beyond the shipped base starter construction",
    },
    OwnSgCatalogEntry {
        num_groups: 15,
        group_size: 7,
        starter_blocks: OWNSG_105_7_STARTERS,
        citation: "Starter blocks for ownSG(105,7) with 9 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 14,
        group_size: 8,
        starter_blocks: OWNSG_112_8_STARTERS,
        citation: "Starter blocks for ownSG(112,8) with 8 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 20,
        group_size: 6,
        starter_blocks: OWNSG_120_6_STARTERS,
        citation: "Starter blocks for ownSG(120,6) with 13 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 18,
        group_size: 7,
        starter_blocks: OWNSG_126_7_STARTERS,
        citation: "Starter blocks for ownSG(126,7) with 10 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 14,
        group_size: 9,
        starter_blocks: OWNSG_126_9_STARTERS,
        citation: "Starter blocks for ownSG(126,9) with 7 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
    OwnSgCatalogEntry {
        num_groups: 15,
        group_size: 9,
        starter_blocks: OWNSG_135_9_STARTERS,
        citation: "Starter blocks for ownSG(135,9) with 7 rounds from Miller–Valkov–Abel 2026 Appendix ownSG table",
    },
];

pub(crate) fn exact_case(
    num_groups: usize,
    group_size: usize,
) -> Option<&'static OwnSgCatalogEntry> {
    CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}

pub(crate) fn source() -> CatalogSource {
    OWNSG_SOURCE
}
