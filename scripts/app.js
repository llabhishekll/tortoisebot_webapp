// vuejs object
var app = new Vue({
  el: "#app",

  // member variables
  data: {
    connected: false,
    robot_name: "TortoiseBot",
    ros: null,
    log_array: [],
    loading: false,
    rosbridge_address: "",
    port: "9090",
  },

  // member method
  methods: {
    // helper methods to connect with ROS
    connect: function () {
      this.loading = true;
      this.ros = new ROSLIB.Ros({
        url: this.rosbridge_address,
      });

      this.ros.on("connection", () => {
        this.log_array.unshift(new Date().toTimeString() + " - Connected!");
        this.connected = true;
        this.loading = false;
      });

      this.ros.on("error", (error) => {
        this.log_array.unshift(
          new Date().toTimeString() + ` - Error: ${error}`
        );
      });

      this.ros.on("close", () => {
        this.log_array.unshift(new Date().toTimeString() + " - Disconnected!");
        this.connected = false;
        this.loading = false;
      });
    },

    // helper methods to disconnect with ROS
    disconnect: function () {
      this.ros.close();
    },
  },

  mounted() {},
});
