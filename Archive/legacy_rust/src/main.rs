mod state;
mod subroutines;

fn main() {
    println!("Starting GroupMixer...");
    subroutines::run_final_algorithm();
    println!("...GroupMixer finished.");
}
