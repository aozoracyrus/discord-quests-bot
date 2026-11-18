import moment from "moment-timezone";
import { ChildUser } from "../childProcess/childUser.js";
import { QuestConfig } from "../lib/questConfig.js";
import ms from "ms";

export default new QuestConfig({
  name: "WATCH_VIDEO_ON_MOBILE",
  async run(user: ChildUser) {
    const taskName = "WATCH_VIDEO";
    const secondsNeeded = user.target;
    let progress = user.current || 0;
    const startDate = moment().unix() - progress;
    
    console.log(`[WATCH_VIDEO_ON_MOBILE] Starting quest ${user.quest} for user ${user.id}`);
    
    while (!user.stoped) {
      const timestamp = moment().unix() - startDate;
      
      const heartbeat = await user.api
        .post(`/quests/${user.quest}/video-progress`, {
          timestamp: timestamp,
        })
        .then(res => {
          console.log(`[WATCH_VIDEO_ON_MOBILE] Heartbeat OK: ${res.status}`);
          return res;
        })
        .catch((err) => {
          console.error(`[WATCH_VIDEO_ON_MOBILE] Heartbeat error:`, {
            status: err?.response?.status,
            data: err?.response?.data,
            message: err?.message
          });
          return err.response;
        });
      
      if (!heartbeat?.data?.user_id) {
        console.error(`[WATCH_VIDEO_ON_MOBILE] Invalid response:`, heartbeat?.data);
        user.stop(`Error sending heartbeat: ${heartbeat?.status || 'unknown'}`);
        break;
      }
      
      const response = user.extractProgress(heartbeat.data);
      user.sendUpdate(progress, response.completed === true);
      progress = response.value;
      user.sendUpdate(progress, response.completed === true);
      
      console.log(`[WATCH_VIDEO_ON_MOBILE] Progress: ${progress}/${secondsNeeded}`);
      
      if (progress >= secondsNeeded || response?.completed === true) {
        console.log(`[WATCH_VIDEO_ON_MOBILE] Quest completed!`);
        user.stop();
        user.completed = true;
        break;
      }
      
      await user.delay(ms("5s"));
    }
  },
});
