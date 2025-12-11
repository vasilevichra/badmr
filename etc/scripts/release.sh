#!/usr/bin/env bash

sudo ln -snf /home/r/badmr/etc/systemd/system/badmr.service /etc/systemd/system/badmr.service
sudo systemctl daemon-reload
sudo systemctl enable badmr.service

sudo systemctl stop badmr.service
rm -f /home/r/badmr/.data/badmr.sqlite3
sudo systemctl start badmr.service