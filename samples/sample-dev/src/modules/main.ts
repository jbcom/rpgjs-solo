import { createModule } from "@rpgjs/common";
import server from "./server";
import client from "./client";


export function provideMain() {
    return createModule('main', [{
        server,
        client
    }])
}