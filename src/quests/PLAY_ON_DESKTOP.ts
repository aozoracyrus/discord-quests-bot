import { ChildUser } from "../childProcess/childUser.js";
import { QuestConfig } from "../lib/questConfig.js";
import ms from "ms";

export default new QuestConfig({
  name: "PLAY_ON_DESKTOP",
  async run(user: ChildUser) {
    const secondsNeeded = user.target;
    let progress = user.current || 0;
    
    console.log(`[PLAY_ON_DESKTOP] Starting quest ${user.quest} for user ${user.id}`);
    
    while (!user.stoped) {
      const heartbeat = await user.api
        .post(`/quests/${user.quest}/heartbeat`, {
          stream_key: `call:${user.quest}:1`,
          terminal: false
        })
        .then(res => {
          console.log(`[PLAY_ON_DESKTOP] Heartbeat OK: ${res.status}`);
          return res;
        })
        .catch((err) => {
          console.error(`[PLAY_ON_DESKTOP] Heartbeat error:`, {
            status: err?.response?.status,
            data: err?.response?.data,
            message: err?.message
          });
          return err.response;
        });
      
      if (!heartbeat?.data?.user_id) {
        console.error(`[PLAY_ON_DESKTOP] Invalid response:`, heartbeat?.data);
        user.stop(`Error sending heartbeat: ${heartbeat?.status || 'unknown'}`);
        break;
      }
      
      const response = user.extractProgress(heartbeat.data);
      progress = response.value;
      user.sendUpdate(progress, response.completed === true);
      
      console.log(`[PLAY_ON_DESKTOP] Progress: ${progress}/${secondsNeeded}`);
      
      if (progress >= secondsNeeded || response?.completed === true) {
        console.log(`[PLAY_ON_DESKTOP] Quest completed!`);
        user.stop();
        user.completed = true;
        break;
      }
      
      await user.delay(ms("30s"));
    }
  },
});
