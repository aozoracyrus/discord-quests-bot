import { ChildUser } from "../childProcess/childUser.js";
import { QuestConfig } from "../lib/questConfig.js";
import ms from "ms";

export default new QuestConfig({
  name: "PLAY_ACTIVITY",
  requireLogin: false,
  requireVoiceChannel: false,
  async run(user: ChildUser) {
    const secondsNeeded = user.target;
    let progress = user.current || 0;
    const streamKey = `call:${user.id}:1`;
    
    console.log(`[PLAY_ACTIVITY] Starting quest ${user.quest} for user ${user.id}`);
    
    while (!user.stoped) {
      const heartbeat = await user.api
        .post(`/quests/${user.quest}/heartbeat`, {  // ← ĐÃ FIX: thêm / ở đầu
          stream_key: streamKey,
          terminal: false
        })
        .then(res => {
          console.log(`[PLAY_ACTIVITY] Heartbeat OK: ${res.status}`);
          return res;
        })
        .catch((err) => {
          console.error(`[PLAY_ACTIVITY] Heartbeat error:`, {
            status: err?.response?.status,
            data: err?.response?.data,
            message: err?.message
          });
          return err.response;
        });
      
      console.log("Heartbeat response:", heartbeat?.data);
      
      if (!heartbeat?.data?.user_id) {
        console.error(`[PLAY_ACTIVITY] Invalid response:`, heartbeat?.data);
        user.stop(`Error sending heartbeat: ${heartbeat?.status || 'unknown'}`);
        break;
      }
      
      const response = user.extractProgress(heartbeat.data);
      progress = response.value;
      user.sendUpdate(progress, response.completed === true);
      
      console.log(`[PLAY_ACTIVITY] Progress: ${progress}/${secondsNeeded}`);
      
      if (progress >= secondsNeeded || response?.completed === true) {
        console.log(`[PLAY_ACTIVITY] Quest completed!`);
        user.stop();
        user.completed = true;
        break;
      }
      
      await user.delay(ms("30s"));
    }
  },
});
