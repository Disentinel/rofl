use axum::routing::{get, post};
use axum::Router;

const PORT: u16 = 3917;

async fn health() -> &'static str {
    "ok"
}

async fn list_users() -> &'static str {
    "users"
}

async fn add_user() -> &'static str {
    "added"
}

async fn version() -> &'static str {
    "v1"
}

async fn upload() -> &'static str {
    "stored"
}

fn api() -> Router {
    Router::new()
        .route("/users", get(list_users).post(add_user))
        .route("/version", get(version))
}

#[tokio::main]
async fn main() {
    let files = Router::new().route("/upload", post(upload));
    let app = Router::new()
        .route("/health", get(health))
        .nest("/api", api())
        .nest("/files", files);
    let addr = format!("127.0.0.1:{}", PORT);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let base = format!("http://127.0.0.1:{PORT}");
    let client = reqwest::Client::new();
    let r1 = client.get(format!("{base}/health")).send().await.unwrap();
    println!("GET /health {} {}", r1.status().as_u16(), r1.text().await.unwrap());
    let r2 = client.get(format!("{}/api/users", base)).send().await.unwrap();
    println!("GET /api/users {} {}", r2.status().as_u16(), r2.text().await.unwrap());
    let r3 = client.post(format!("{base}/api/users")).send().await.unwrap();
    println!("POST /api/users {} {}", r3.status().as_u16(), r3.text().await.unwrap());
    let r4 = reqwest::get(format!("{base}/api/version")).await.unwrap();
    println!("GET /api/version {} {}", r4.status().as_u16(), r4.text().await.unwrap());
    let r5 = client.post(format!("{base}/files/upload")).send().await.unwrap();
    println!("POST /files/upload {} {}", r5.status().as_u16(), r5.text().await.unwrap());
    let r6 = client.delete(format!("{base}/api/users")).send().await.unwrap();
    println!("DELETE /api/users {}", r6.status().as_u16());
    let r7 = client.get(format!("{base}/missing")).send().await.unwrap();
    println!("GET /missing {}", r7.status().as_u16());
}
