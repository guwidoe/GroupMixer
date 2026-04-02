use gm_api::api::routes::create_router;
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let app = create_router();

    // run it
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
