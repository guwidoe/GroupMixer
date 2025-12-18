mod api;
mod jobs;

use api::{handlers::AppState, routes::create_router};
use jobs::manager::JobManager;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // Initialize the JobManager and AppState
    let job_manager = JobManager::new();
    let app_state = AppState { job_manager };

    // build our application with the new router
    let app = create_router(app_state);

    // run it
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
