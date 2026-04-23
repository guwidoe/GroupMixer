use super::CatalogSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct MolsCatalogEntry {
    pub(crate) num_groups: usize,
    pub(crate) mols_count: usize,
    pub(crate) encoded_mols: &'static str,
    pub(crate) citation: &'static str,
}

const MOLS_SOURCE: CatalogSource = CatalogSource {
    name: "mols_catalog",
    citation: "Catalog-backed explicit MOLS bank from the Sage combinatorial-designs database",
};

const MOLS_12_5: &str = r#"
abcdefghijkl abcdefghijkl abcdefghijkl abcdefghijkl abcdefghijkl
badcfehgjilk ghefklijcdab dcbahgfelkji jilkbadcfehg klijcdabghef
cdabghefklij efghijklabcd lkjidcbahgfe ijklabcdefgh fehgjilkbadc
dcbahgfelkji cdabghefklij ghefklijcdab badcfehgjilk hgfelkjidcba
ijklabcdefgh klijcdabghef efghijklabcd fehgjilkbadc jilkbadcfehg
jilkbadcfehg fehgjilkbadc hgfelkjidcba dcbahgfelkji lkjidcbahgfe
klijcdabghef hgfelkjidcba jilkbadcfehg cdabghefklij dcbahgfelkji
lkjidcbahgfe ijklabcdefgh badcfehgjilk efghijklabcd ghefklijcdab
efghijklabcd jilkbadcfehg fehgjilkbadc lkjidcbahgfe cdabghefklij
fehgjilkbadc dcbahgfelkji cdabghefklij ghefklijcdab badcfehgjilk
ghefklijcdab badcfehgjilk klijcdabghef hgfelkjidcba ijklabcdefgh
hgfelkjidcba lkjidcbahgfe ijklabcdefgh klijcdabghef efghijklabcd
"#;

const MOLS_14_4: &str = r#"
bjihgkecalnfmd  bfmcenidgjhalk  bcdefghijklmna  bcdefghijklmna
fckjbhledimagn  jcgndfalehkbim  gnkjdmiclbhaef  jflhnkaecmgdib
mgdlkcbafejnih  ikdhaegnmfblcj  lifhbjemkangcd  emkdjbgfnliahc
cnhemldbigfkaj  hjlebifkangcmd  dalmgnbjehcfik  anighmflkbdcej
edabfnmkcjhgli  gbkmfcjeliahdn  njcaeifhbdgkml  kebcajimdgfhln
nfeicgajldkbhm  khclngdafmjibe  mfbkcdlagnjihe  cgnflembihakjd
iagfjdhnkmelcb  elbdmahfignkjc  aemnhkjdcifblg  ilabkdnhfcjegm
dlnkeafimhcjbg  ceabkjnihdmgfl  hdnikbagmcelfj  ljgnihecbamfdk
gemalfihjnbdkc  adficlkmjbenhg  cgjflhnbiekdam  ndmabcjglfeikh
jhfnimgdbkacel  liegjdmhnkcfab  fkibmagenldhjc  mbhiefljadkncg
hkbgajnmeclidf  nmjfhkecbaldgi  imhlneckdfajgb  difjcnkamehgbl
ablchikgnfdmje  fankgbljdcimeh  klegafdnhjmcbi  ghckmlbdeinjaf
licmdbjfhagenk  mgialhcbkedjnf  jhadicmlfgbekn  fajlgidkhncbme
kmjdneclgbihfa  dnhjimbgclfeka  ebgcjlkfamindh  hkemdacngjblfi
"#;

const MOLS_15_4: &str = r#"
bcdefghijklmnoa  bdgiknfcamehjlo  bhealiofmdjgcnk  blhcmdinejofakg
abcdefghijklmno  acehjlogdbnfikm  lcifbmjagnekhdo  hcmidnejofkagbl
oabcdefghijklmn  nbdfikmahecogjl  amdjgcnkbhoflie  midnjeofkaglbhc
noabcdefghijklm  mocegjlnbifdahk  fbnekhdolciagmj  dnjeokfaglbhmci
mnoabcdefghijkl  lnadfhkmocjgebi  kgcoflieamdjbhn  jeokfalgbhmcind
lmnoabcdefghijk  jmobegilnadkhfc  olhdagmjfbnekci  ekfalgbmhcindjo
klmnoabcdefghij  dknacfhjmobelig  jamiebhnkgcofld  aflgbmhcnidjoek
jklmnoabcdefghi  helobdgiknacfmj  ekbnjfciolhdagm  lbgmhcnidojekaf
ijklmnoabcdefgh  kifmacehjlobdgn  nflcokgdjamiebh  gmchnidojeakflb
hijklmnoabcdefg  oljgnbdfikmaceh  iogmdalhekbnjfc  chndiojeakfblgm
ghijklmnoabcdef  iamkhocegjlnbdf  djahnebmiflcokg  ndioejakfblgcmh
fghijklmnoabcde  gjbnliadfhkmoce  hekbiofcnjgmdal  ioejafkblgcmhdn
efghijklmnoabcd  fhkcomjbegilnad  miflcjagdokhneb  ojafkbglcmhdnie
defghijklmnoabc  egildankcfhjmob  cnjgmdkbhealiof  fakbglchmdnieoj
cdefghijklmnoab  cfhjmeboldgikna  gdokhnelcifbmja  kgblchmdineojfa
"#;

const MOLS_18_5: &str = r#"
adgqknbehlorpjmcfi ahfmkrqojcgenlpbid aieokplqmjrnhdcfbg afhegcqjodibrkmnpl acbjlkdfeihgrqponm
hbeorlicfpjmnqkgad dbipnlkrmfahqojecg fbgqmlnjrokpaiehdc ibdafhmrkcegnpljoq cbalkjfedhgiqprnmo
ficjmpdganqklorehb gecjqonlpidbkrmhfa hdcjrnpokqmlfbgaie egcibdlnphafjoqrkm backjledfgihprqmon
ehbdgaknqficorljmp krmdbipnlecgfahqoj okpdchrnjieamlqbgf kmrdibhafqjogcelnp gihdfemonrqpcbalkj
cfibehrloadgjmpqkn nlpgecjqohfaidbkrm qmlieakpobgfrnjdch plncegdibmrkfhaqjo ihgfedonmqprbackjl
gadicfmpjhbeqknorl qojahfmkrbidcgenlp jrnbgfmlqdchkpoiea oqjhafceglnpbdimrk hgiedfnmoprqacbjlk
nqkhbegadmpjicfrlo jqonlpgeckrmhfaidb lqmrnjgfbeaichdpok bdinplgceoqjkmrafh prqacbgihonmlkjfed
lorficehbknqdgampj mkrqojahfnlpbidcge njrkpochdgfbeailqm gcejoqfhakmrplnibd rqpcbaihgnmokjledf
pjmadgcfirlobehknq pnlkrmdbiqojecgfah pokmlqeaichdgfbnjr fharkmbdiplnoqjegc qprbachgimonjlkdfe
orlgadjmpicfknqbeh lpnhfacgejqodbirmk gfblqmhdcaiejrnokp joqplnafhegcmrkdib edfonmjlkcbagihqpr
jmpehbqkndgarloicf ojqbidfahmkrgeclpn chdnjraiefbgokpqml rkmoqjibdafhlnpceg dfenmolkjbacihgprq
qkncfiorlbehmpjdga rmkecgidbpnlahfojq eaipokfbghdcqmljrn nplkmregcibdqjohaf fedmonkjlacbhgirqp
mpjrloadgehbcfinqk fahojqbidlpnmkrgec bgfaieokprnjdchmlq dibmrkjoqgcehafpln monhgirqpkjlfedacb
knqmpjhbecfigadlor idbrmkecgojqpnlahf dchfbgqmlkpoiearnj ceglnprkmfhadiboqj onmgihqprjlkedfcba
rloknqficgadehbpjm cgelpnhfarmkjqodbi ieahdcjrnmlqbgfkpo hafqjonplbdicegkmr nmoihgprqlkjdfebac
dgapjmlorqknhbefic ecgidbrmkahfojqpnl rnjeaidchpoklqmgfb mrkgceplnjoqafhbdi lkjprqbacdfenmoihg
behnqkpjmorlficadg hfacgelpndbirmkjqo kpogfbiealqmnjrchd lnpfhaoqjrkmibdgce kjlrqpacbfedmonhgi
icflornqkjmpadghbe bidfahojqgeclpnmkr mlqchdbgfnjrpokeai qjobdikmrnplegcfha jlkqprcbaedfonmgih
"#;

const CASES: &[MolsCatalogEntry] = &[
    MolsCatalogEntry {
        num_groups: 12,
        mols_count: 5,
        encoded_mols: MOLS_12_5,
        citation: "Explicit 5 MOLS of order 12 from the Sage combinatorial-designs database, attributed there to Brendan McKay",
    },
    MolsCatalogEntry {
        num_groups: 14,
        mols_count: 4,
        encoded_mols: MOLS_14_4,
        citation: "Explicit 4 MOLS of order 14 from the Sage combinatorial-designs database, attributed there to Ian Wanless / Todorov 2012",
    },
    MolsCatalogEntry {
        num_groups: 15,
        mols_count: 4,
        encoded_mols: MOLS_15_4,
        citation: "Explicit 4 MOLS of order 15 from the Sage combinatorial-designs database, attributed there to Ian Wanless",
    },
    MolsCatalogEntry {
        num_groups: 18,
        mols_count: 5,
        encoded_mols: MOLS_18_5,
        citation: "Explicit 5 MOLS of order 18 deterministically derived from Sage's OA_7_18 construction (Julian Abel 2013) via the standard OA-to-MOLS equivalence with a distinguished resolution square",
    },
];

pub(crate) fn source() -> &'static CatalogSource {
    &MOLS_SOURCE
}

pub(crate) fn exact_case(num_groups: usize) -> Option<&'static MolsCatalogEntry> {
    CASES.iter().find(|entry| entry.num_groups == num_groups)
}
