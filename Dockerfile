# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend-build
WORKDIR /web
COPY src/TaskFlow.Web/package.json src/TaskFlow.Web/package-lock.json ./
RUN npm ci
COPY src/TaskFlow.Web/ .
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /src
COPY Directory.Build.props Directory.Packages.props global.json ./
COPY src/TaskFlow.Api/TaskFlow.Api.csproj src/TaskFlow.Api/
COPY src/TaskFlow.Application/TaskFlow.Application.csproj src/TaskFlow.Application/
COPY src/TaskFlow.Domain/TaskFlow.Domain.csproj src/TaskFlow.Domain/
COPY src/TaskFlow.Infrastructure/TaskFlow.Infrastructure.csproj src/TaskFlow.Infrastructure/
COPY src/TaskFlow.Infrastructure.Migrations.Postgres/TaskFlow.Infrastructure.Migrations.Postgres.csproj src/TaskFlow.Infrastructure.Migrations.Postgres/
COPY src/TaskFlow.ServiceDefaults/TaskFlow.ServiceDefaults.csproj src/TaskFlow.ServiceDefaults/
RUN dotnet restore src/TaskFlow.Api/TaskFlow.Api.csproj
COPY . .
RUN dotnet publish src/TaskFlow.Api/TaskFlow.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=backend-build /app/publish .
COPY --from=frontend-build /web/dist ./wwwroot
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "TaskFlow.Api.dll"]
