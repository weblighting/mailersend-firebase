/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { logger } = require("firebase-functions");
const fs = require("fs");

module.exports = {
    start: () => {
        logger.log("Starting sending email");
    },
    startWebHook: (event) => {
        logger.log("Starting webhook ", event);
    },
    log: (message, permanent = false) => {
        logger.log(message);
        if (permanent) {
            fs.appendFileSync("log.txt", message + "\n");
        }
    },
    error: (message) => {
        logger.error(message);
    },
    end: (info) => {
        logger.log("End sending email", info);
    },
};