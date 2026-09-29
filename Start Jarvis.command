#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="/Applications/ChatGPT.app/Contents/Resources:/opt/homebrew/bin:/usr/local/bin:$PATH"
npm start
