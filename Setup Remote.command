#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run remote:setup
read '?완료 후 Enter를 누르세요.'
