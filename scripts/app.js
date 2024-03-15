// vuejs object
var app = new Vue({
  el: "#app",

  // member variables
  data: {
    // ros connection
    connected: false,
    robot_name: "TortoiseBot",
    ros: null,
    // log_array: [],
    log_array: [{ level: 0, msg: "Ready to connect!" }],
    loading: false,
    rosbridge_address: "",
    port: "9090",

    // odometry
    position: { x: 0.0, y: 0.0, z: 0.0 },

    // velocity
    velocity: { x: 0.0, y: 0.0, z: 0.0 },

    // 3D viewer
    viewer: null,
    tf_client: null,
    urdf_client: null,

    // 2D map
    map_viewer: null,
    map_grid_client: null,
    interval: null,

    // action
    action_goal: null,
    action: {
      goal: { position: { x: 0.0, y: 0.0, z: 0.0 } },
      status: { status: 0, text: "" },
      feedback: { position: 0.0, state: "idle" },
      result: { success: false },
    },

    // waypoints
    waypoints: [
      { name: "Waypoint X", x: 0.0, y: 0.0 }, // dummy waypoint
      { name: "Waypoint 1", x: 0.65, y: -0.50 },
      { name: "Waypoint 1", x: 0.65, y: 0.00 },
      { name: "Waypoint 3", x: 0.60, y: 0.50 },
      { name: "Waypoint 4", x: 0.25, y: 0.45 },
      { name: "Waypoint 5", x: 0.25, y: 0.0 },
      { name: "Waypoint 6", x: -0.15, y: -0.10 },
      { name: "Waypoint 7", x: -0.15, y: -0.45 },
      { name: "Waypoint 8", x: -0.15, y: 0.45 },
      { name: "Waypoint 9", x: -0.50, y: 0.50 },
      { name: "Waypoint 0", x: 0.0, y: 0.0 },
    ],

    // dragging
    dragging: { x: "no", y: "no", status: false },
    dragging_style: {
      margin: "0px",
      top: "0px",
      left: "0px",
      display: "inline-block",
      width: "75px",
      height: "75px",
    },

    // joystick
    joystick: { x: 0.0, z: 0.0 },
  },

  // member method
  methods: {
    // helper methods to connect with ROS
    connect: function () {
      // ros connection and log
      this.loading = true;
      this.ros = new ROSLIB.Ros({
        url: this.rosbridge_address,
      });

      this.ros.on("connection", () => {
        this.log_array.unshift({
          level: 0,
          msg: "Connected : " + new Date().toTimeString(),
        });
        this.connected = true;
        this.loading = false;

        // if connected, load viewers
        this.set_camera_viewer();
        this.set_3D_viewer();
        this.set_map_viewer();
      });

      this.ros.on("error", (error) => {
        this.log_array.unshift({
          level: 0,
          msg: `Error : ${error}` + new Date().toTimeString(),
        });
      });

      this.ros.on("close", () => {
        this.log_array.unshift({
          level: 0,
          msg: "Disconnected : " + new Date().toTimeString(),
        });
        this.connected = false;
        this.loading = false;

        // if disconnected, clean viewers
        this.clean_up();
      });

      // subscribe callback to rosout
      let topic_rosout = new ROSLIB.Topic({
        ros: this.ros,
        name: "/rosout",
        messageType: "rosgraph_msgs/Log",
      });

      topic_rosout.subscribe((message) => {
        if(message.name == "/tortoisebot_as" && message.level == 2) {
            // pass
        } else {
        this.log_array.unshift({ level: message.level, msg: message.msg });
        };
      });

      // subscribe callback to odometry
      let topic_odometry = new ROSLIB.Topic({
        ros: this.ros,
        name: "/odom",
        messageType: "nav_msgs/Odometry",
      });

      topic_odometry.subscribe((message) => {
        this.position = message.pose.pose.position;
      });

      // subscribe callback to velocity
      let topic_velocity = new ROSLIB.Topic({
        ros: this.ros,
        name: "/cmd_vel",
        messageType: "geometry_msgs/Twist",
      });

      topic_velocity.subscribe((message) => {
        this.velocity.x = message.linear.x;
        this.velocity.y = message.linear.y;
        this.velocity.z = message.angular.z;
      });
    },

    // helper methods to disconnect with ROS
    disconnect: function () {
      this.ros.close();
    },

    // publisher callback to velocity
    publish_velocity: function (x, z) {
      let velocity = new ROSLIB.Topic({
        ros: this.ros,
        name: "/cmd_vel",
        messageType: "geometry_msgs/Twist",
      });
      let message = new ROSLIB.Message({
        linear: { x: x, y: 0.0, z: 0.0 },
        angular: { x: 0.0, y: 0.0, z: z },
      });
      velocity.publish(message);
    },

    // set camera view feed
    set_camera_viewer: function () {
      let without_wss = this.rosbridge_address.split("wss://")[1];
      let domain = without_wss.split("/")[0] + "/" + without_wss.split("/")[1];
      let host = domain + "/cameras";
      let viewer = new MJPEGCANVAS.Viewer({
        divID: "id_camera_canvas",
        host: host,
        width: 400,
        height: 400,
        topic: "/camera/image_raw",
        ssl: true,
      });
    },

    // set 3D view feed
    set_3D_viewer: function () {
      // add viewer
      this.viewer = new ROS3D.Viewer({
        background: "#f2f2f2",
        divID: "id_3D_viewer",
        width: 400,
        height: 400,
        antialias: true,
        fixedFrame: "odom",
      });

      // add a grid
      this.viewer.addObject(
        new ROS3D.Grid({
          color: "#66aee8",
          cellSize: 0.25,
          num_cells: 40,
        })
      );

      // setup a client to listen robot TFs
      this.tf_client = new ROSLIB.TFClient({
        ros: this.ros,
        angularThres: 0.01,
        transThres: 0.01,
        rate: 10.0,
      });

      // setup the URDF client
      this.urdf_client = new ROS3D.UrdfClient({
        ros: this.ros,
        param: "robot_description",
        tfClient: this.tf_client,
        // we use "path: location.origin + location.pathname"
        // instead of "path: window.location.href" to remove query params,
        // otherwise the assets fail to load
        path: location.origin + location.pathname,
        rootObject: this.viewer.scene,
        loader: ROS3D.COLLADA_LOADER_2,
      });
    },

    // set map view feed
    set_map_viewer: function () {
      // add viewer
      this.map_viewer = new ROS2D.Viewer({
        divID: "id_map",
        width: 400,
        height: 400,
      });

      // setup the map client
      this.map_grid_client = new ROS2D.OccupancyGridClient({
        ros: this.ros,
        rootObject: this.map_viewer.scene,
        continuous: true,
      });

      // scale the canvas to fit to the map
      this.map_grid_client.on("change", () => {
        // scale dimensions
        this.map_viewer.scaleToDimensions(
          this.map_grid_client.currentGrid.width / 5,
          this.map_grid_client.currentGrid.height / 5,
        );
        
        // update origin
        this.map_viewer.shift(
          this.map_grid_client.currentGrid.pose.position.x + 8.0,
          this.map_grid_client.currentGrid.pose.position.y + 8.0,
        );
      });
    },

    // handle waypoint request
    handle_waypoint_request: function (event) {
      let waypoint = this.waypoints[event.target.options.selectedIndex];
      this.action.goal.position.x = waypoint.x;
      this.action.goal.position.y = waypoint.y;
    },

    // send action goal
    send_goal: function () {
      // action client
      let action_client = new ROSLIB.ActionClient({
        ros: this.ros,
        serverName: "/tortoisebot_as",
        actionName: "course_web_dev_ros/WaypointActionAction",
      });

      // define action goal
      this.action_goal = new ROSLIB.Goal({
        actionClient: action_client,
        goalMessage: {
          ...this.action.goal,
        },
      });

      // goal status
      this.action_goal.on("status", (status) => {
        this.action.status = status;
      });

      // goal feedback
      this.action_goal.on("feedback", (feedback) => {
        this.action.feedback = feedback;
      });

      // goal result
      this.action_goal.on("result", (result) => {
        this.action.result = result;
      });

      this.action_goal.send();
    },

    // cancel action goal
    cancel_goal: function () {
      this.action_goal.cancel();
    },

    // joystick on page load
    joystick_on_load() {
      // reset joystick to home position
      let ref = document.getElementById("id_drag_start_zone");
      let minTop = ref.offsetTop - parseInt(this.dragging_style.height) / 2;
      let maxTop = minTop + 200;
      let top = 100.0 + minTop;
      this.dragging_style.top = `${top}px`;

      let minLeft = ref.offsetLeft - parseInt(this.dragging_style.width) / 2;
      let maxLeft = minLeft + 200;
      let left = 100.0 + minLeft;
      this.dragging_style.left = `${left}px`;
    },

    // joystick on mouse click
    joystick_start_drag() {
      this.dragging.status = true;
      this.dragging.x = 0.0;
      this.dragging.y = 0.0;
    },

    // joystick on mouse movement
    joystick_do_drag(event) {
      if (this.dragging.status) {
        // calculate drag
        let ref = document.getElementById("id_drag_start_zone");
        this.dragging.x = event.offsetX;
        this.dragging.y = event.offsetY;

        let minTop = ref.offsetTop - parseInt(this.dragging_style.height) / 2;
        let maxTop = minTop + 200;
        let top = this.dragging.y + minTop;
        this.dragging_style.top = `${top}px`;

        let minLeft = ref.offsetLeft - parseInt(this.dragging_style.width) / 2;
        let maxLeft = minLeft + 200;
        let left = this.dragging.x + minLeft;
        this.dragging_style.left = `${left}px`;

        // update joystick values
        this.joystick.x = -1 * (this.dragging.y / 200 - 0.5);
        this.joystick.z = -1 * (this.dragging.x / 200 - 0.5);

        // publish on topic
        this.publish_velocity(this.joystick.x, this.joystick.z);
      }
    },

    // joystick on mouse release
    joystick_stop_drag() {
      this.dragging.status = false;
      this.dragging.x = this.dragging.y = "no";

      // reset joystick to home position
      let ref = document.getElementById("id_drag_start_zone");
      let minTop = ref.offsetTop - parseInt(this.dragging_style.height) / 2;
      let maxTop = minTop + 200;
      let top = 100.0 + minTop;
      this.dragging_style.top = `${top}px`;

      let minLeft = ref.offsetLeft - parseInt(this.dragging_style.width) / 2;
      let maxLeft = minLeft + 200;
      let left = 100.0 + minLeft;
      this.dragging_style.left = `${left}px`;

      // update joystick values
      this.joystick.x = 0.0;
      this.joystick.z = 0.0;

      // publish on topic
      this.publish_velocity(this.joystick.x, this.joystick.z);
    },

    // ui cleanup
    clean_up: function () {
      document.getElementById("id_camera_canvas").innerHTML = "";
      document.getElementById("id_3D_viewer").innerHTML = "";
      document.getElementById("id_map").innerHTML = "";
    },
  },

  mounted() {
    // load joystick on page load
    this.joystick_on_load();

    // update map in certain interval
    this.interval = setInterval(() => {
      if (this.ros != null && this.ros.isConnected) {
        this.ros.getNodes(
          (data) => {},
          (error) => {},
        );
      }
    }, 10000);

    // reset joystick on mouse release
    window.addEventListener("mouseup", this.joystick_stop_drag);
  },
});
