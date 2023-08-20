const express = require("express");
const app = express();

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
app.use(express.json());

let db = null;
const initializingDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializingDBAndServer();

const convertDBObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const userDetails = request.body;
  const { username, password } = userDetails;

  const selectUserQuery = ` SELECT * FROM user WHERE username = '${username}'; `;
  const user = await db.get(selectUserQuery);

  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordIsMatched = await bcrypt.compare(password, user.password);
    if (isPasswordIsMatched) {
      const payload = { username: username };
      const jwtoken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtoken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStatesQuery = ` SELECT * FROM state;`;
  const statesArrayList = await db.all(getAllStatesQuery);
  response.send(
    statesArrayList.map((eachState) =>
      convertDBObjectToResponseObject(eachState)
    )
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = ` SELECT * FROM state WHERE state_id = '${stateId}';`;
  const state = await db.get(getStateQuery);
  response.send(convertDBObjectToResponseObject(state));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const addDistrictQuery = `
  INSERT INTO
    district (state_id, district_name,cases, cured, active, deaths)
  VALUES 
    (${stateId}, '${districtName}', '${cases}', '${cured}', '${active}', '${deaths}');`;
  const dbResponse = await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = ` SELECT * FROM district WHERE district_id = '${districtId}';`;
    const district = await db.get(getDistrictQuery);
    response.send(convertDBObjectToResponseObject(district));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const removeDistrictQuery = `DELETE FROM district WHERE district_id = '${districtId}';`;
    const dbResponse = await db.run(removeDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `UPDATE district 
    SET 
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE 
      district_id = ${districtId};`;

    const dbResponse = await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatesStatsQuery = `
  SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
  FROM 
    district 
  WHERE 
    state_id = ${stateId};`;
    const stats = await db.get(getStatesStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
