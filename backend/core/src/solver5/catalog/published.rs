use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PublishedScheduleEntry {
    pub(crate) num_groups: usize,
    pub(crate) group_size: usize,
    pub(crate) encoded_weeks: &'static [&'static [&'static [usize]]],
    pub(crate) citation: &'static str,
}

const PUBLISHED_SCHEDULE_SOURCE: CatalogSource = CatalogSource {
    name: "published_schedule_bank",
    citation: "Warwick Harvey, Solutions to various Social Golfer configurations (Wayback snapshot 2005-04-07)",
};

const WEEK_0: &[&[usize]] = &[
    &[0, 1, 2],
    &[3, 4, 5],
    &[6, 7, 8],
    &[9, 10, 11],
    &[12, 13, 14],
    &[15, 16, 17],
    &[18, 19, 20],
    &[21, 22, 23],
];

const WEEK_1: &[&[usize]] = &[
    &[0, 3, 6],
    &[1, 9, 12],
    &[2, 15, 18],
    &[4, 7, 21],
    &[5, 10, 13],
    &[8, 16, 19],
    &[11, 14, 22],
    &[17, 20, 23],
];

const WEEK_2: &[&[usize]] = &[
    &[0, 4, 8],
    &[1, 10, 14],
    &[2, 7, 22],
    &[3, 15, 20],
    &[5, 9, 17],
    &[6, 12, 19],
    &[11, 13, 21],
    &[16, 18, 23],
];

const WEEK_3: &[&[usize]] = &[
    &[0, 10, 18],
    &[1, 7, 11],
    &[2, 17, 19],
    &[3, 8, 13],
    &[4, 14, 23],
    &[5, 16, 21],
    &[6, 9, 15],
    &[12, 20, 22],
];

const WEEK_4: &[&[usize]] = &[
    &[0, 11, 17],
    &[1, 8, 20],
    &[2, 14, 21],
    &[3, 9, 22],
    &[4, 10, 16],
    &[5, 6, 18],
    &[7, 12, 15],
    &[13, 19, 23],
];

const WEEK_5: &[&[usize]] = &[
    &[0, 14, 16],
    &[1, 15, 19],
    &[2, 5, 20],
    &[3, 11, 23],
    &[4, 6, 22],
    &[7, 13, 18],
    &[8, 9, 21],
    &[10, 12, 17],
];

const WEEK_6: &[&[usize]] = &[
    &[0, 15, 21],
    &[1, 13, 22],
    &[2, 6, 23],
    &[3, 10, 19],
    &[4, 17, 18],
    &[5, 7, 14],
    &[8, 11, 12],
    &[9, 16, 20],
];

const WEEK_7: &[&[usize]] = &[
    &[0, 7, 20],
    &[1, 3, 18],
    &[2, 11, 16],
    &[4, 13, 15],
    &[5, 12, 23],
    &[6, 10, 21],
    &[8, 17, 22],
    &[9, 14, 19],
];

const WEEK_8: &[&[usize]] = &[
    &[0, 9, 23],
    &[1, 17, 21],
    &[2, 4, 12],
    &[3, 7, 16],
    &[5, 11, 19],
    &[6, 13, 20],
    &[8, 14, 18],
    &[10, 15, 22],
];

const WEEK_9: &[&[usize]] = &[
    &[0, 19, 22],
    &[1, 6, 16],
    &[2, 9, 13],
    &[3, 14, 17],
    &[4, 11, 20],
    &[5, 8, 15],
    &[7, 10, 23],
    &[12, 18, 21],
];

const CASE_8_3_10_WEEKS: &[&[&[usize]]] = &[
    WEEK_0, WEEK_1, WEEK_2, WEEK_3, WEEK_4, WEEK_5, WEEK_6, WEEK_7, WEEK_8, WEEK_9,
];

const PUBLISHED_CASES: &[PublishedScheduleEntry] = &[PublishedScheduleEntry {
    num_groups: 8,
    group_size: 3,
    encoded_weeks: CASE_8_3_10_WEEKS,
    citation: "Explicit 8-3-10 schedule from Warwick Harvey, Solutions to various Social Golfer configurations (Wayback snapshot 2005-04-07)",
}];

pub(crate) fn exact_case(
    num_groups: usize,
    group_size: usize,
) -> Option<&'static PublishedScheduleEntry> {
    PUBLISHED_CASES
        .iter()
        .find(|entry| entry.num_groups == num_groups && entry.group_size == group_size)
}

pub(crate) fn source() -> CatalogSource {
    PUBLISHED_SCHEDULE_SOURCE
}
