use actix::*;
use actix_files as fs;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;

mod server;

/// Entry point for our route
async fn chat_route(
    req: HttpRequest,
    stream: web::Payload,
    srv: web::Data<Addr<server::ChatServer>>,
) -> Result<HttpResponse, Error> {
    ws::start(
        WsChatSession::new(srv.get_ref().clone()),
        &req,
        stream,
    )
}

struct WsChatSession {
    // address of chat server so the session can send messages to the server
    addr: Addr<server::ChatServer>,
    // id of session - each connection gets an id after server
    // handles Connect message
    id: usize,
}

impl WsChatSession {
    fn new(addr: Addr<server::ChatServer>) -> Self {
        WsChatSession { addr, id: 0 }
    }
}

impl Actor for WsChatSession {
    type Context = ws::WebsocketContext<Self>;

    /// Method is called on actor start.
    /// We register ws session with ChatServer
    fn started(&mut self, ctx: &mut Self::Context) {
        // register self in chat server. `AsyncContext::wait` register
        // future within context, but context waits until this future resolves
        // before processing any other events.
        // HttpContext::state() is instance of WsChatSessionState, state is shared
        // across all routes within application
        let addr = ctx.address(); // This is the address of the session actor
        self.addr
            .send(server::Connect {
                addr: addr.recipient(), // addr.recipient is address of sender?
            })
            .into_actor(self)
            .then(|connect_result, session_actor, ctx| {
                if let Ok(sent_id) = connect_result {
                    session_actor.id = sent_id; // store the ID from the server
                } else {
                    ctx.stop();
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        // notify chat server
        self.addr.do_send(server::Disconnect { id: self.id });
        Running::Stop
    }
}

/// Handle messages from chat server, we simply send it to peer websocket
impl Handler<server::Message> for WsChatSession {
    type Result = ();

    // I have no idea what this is. This is for when the session receives messages?
    fn handle(&mut self, msg: server::Message, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

/// WebSocket message handler
impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsChatSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };

        if let ws::Message::Text(text) = msg {
            let msg = text.trim().to_owned();
            self.addr.do_send(server::ClientMessage { id: self.id, msg })
        } else if let ws::Message::Close(_) = msg {
            ctx.stop();
        }
    }
}

#[actix_rt::main]
async fn main() -> std::io::Result<()> {
    // Start chat server actor
    let server = server::ChatServer::default().start();

    // Create Http server with websocket support
    HttpServer::new(move || {
        App::new()
            .data(server.clone())
            .service(web::resource("/ws/").to(chat_route))
            .service(fs::Files::new("/", "build/").index_file("index.html"))
    })
    .bind("127.0.0.1:3012")?
    .run()
    .await
}
