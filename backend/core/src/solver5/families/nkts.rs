use crate::solver5::catalog::nkts::NktsCatalogEntry;
use crate::solver5::types::Schedule;

pub(super) fn construct(entry: &NktsCatalogEntry) -> Schedule {
    let alphabet = entry.alphabet.chars().collect::<Vec<_>>();
    let weeks = entry
        .encoded_weeks
        .iter()
        .map(|week| {
            week.iter()
                .map(|block| {
                    block
                        .chars()
                        .map(|symbol| {
                            alphabet
                                .iter()
                                .position(|candidate| *candidate == symbol)
                                .expect("nkts catalog symbol should appear in the declared alphabet")
                        })
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    Schedule::from_raw(weeks)
}
