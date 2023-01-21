#!/bin/bash

if [ "$NODE_ENV" == "production" ] ; then
  Xvfb -ac :99 -screen 0 1280x1024x16 & export DISPLAY=:99
  yarn start
else
  npm run dev
fi